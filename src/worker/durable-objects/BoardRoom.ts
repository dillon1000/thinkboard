import {
	DurableObjectSqliteSyncWrapper,
	type SessionStateSnapshot,
	SQLiteSyncStorage,
	TLSocketRoom,
} from '@tldraw/sync-core'
import { TLRecord } from '@tldraw/tlschema'
import { apiRoutePatterns } from '@agentboard/shared'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, IRequest } from 'itty-router'
import { z } from 'zod'
import { boardSchema } from '../boardSchema'

interface SocketAttachment {
	sessionID: string
	snapshot: SessionStateSnapshot | null
}

// Each whiteboard room is hosted in a Durable Object with WebSocket Hibernation.
// https://developers.cloudflare.com/durable-objects/
//
// There's only ever one durable object instance per room. Room state is
// persisted automatically to SQLite via ctx.storage. When all clients are
// idle, the DO hibernates (freeing memory) while WebSocket connections
// stay alive at the Cloudflare layer.
export class BoardRoom extends DurableObject<Env> {
	private room: TLSocketRoom<TLRecord, void> | null = null
	private readonly sessionIDToWebSocket = new Map<string, WebSocket>()

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		// Respond to ping messages at the platform level without waking the DO.
		// The TLSyncClient sends {"type":"ping"} every 5s; without this, each
		// ping would wake the DO from hibernation.
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
		)
	}

	private getOrCreateRoom(): TLSocketRoom<TLRecord, void> {
		if (!this.room) {
			const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage)
			const storage = new SQLiteSyncStorage<TLRecord>({ sql })

			this.room = new TLSocketRoom<TLRecord, void>({
				schema: boardSchema,
				storage,
				clientTimeout: Infinity,
				onSessionSnapshot: (sessionID, snapshot) => {
					const ws = this.sessionIDToWebSocket.get(sessionID)
					if (ws) ws.serializeAttachment({ sessionID, snapshot })
				},
			})

			// Resume any sessions that survived hibernation
			for (const ws of this.ctx.getWebSockets()) {
				const attachment = ws.deserializeAttachment() as SocketAttachment | null
				if (!attachment?.sessionID) continue

				if (attachment.snapshot) {
					this.room.handleSocketResume({
						sessionId: attachment.sessionID,
						socket: ws,
						snapshot: attachment.snapshot,
					})
				}
			}
		}
		return this.room
	}

	private readonly router = AutoRouter({ catch: (e) => error(e) })
		.get(apiRoutePatterns.boardSocket, (request) => this.handleConnect(request))
		.get(apiRoutePatterns.boardContext, () => Response.json({
			documentClock: this.getOrCreateRoom().getCurrentDocumentClock(),
		}))

	// Entry point for all requests to the Durable Object
	fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	// Handle new WebSocket connection requests
	async handleConnect(request: IRequest) {
		const sessionID = z.string().min(1).safeParse(request.query.sessionId)
		if (!sessionID.success) return error(400, 'Missing sessionId')

		// Create the websocket pair for the client
		const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair()
		// Use hibernation API instead of serverWebSocket.accept()
		this.ctx.acceptWebSocket(serverWebSocket)

		// Store sessionId in attachment immediately so we can identify this socket
		// after hibernation, before the connect handshake completes.
		const attachment: SocketAttachment = { sessionID: sessionID.data, snapshot: null }
		serverWebSocket.serializeAttachment(attachment)

		// Connect to the room. The first webSocketMessage from the client will
		// complete the handshake and trigger debounced snapshot storage.
		this.getOrCreateRoom().handleSocketConnect({
			isReadonly: request.headers.get('x-agentboard-readonly') === 'true',
			sessionId: sessionID.data,
			socket: serverWebSocket,
		})

		return new Response(null, { status: 101, webSocket: clientWebSocket })
	}

	// --- WebSocket Hibernation API handlers ---

	private getSessionID(ws: WebSocket): string | null {
		const attachment = ws.deserializeAttachment() as SocketAttachment | null
		return attachment?.sessionID ?? null
	}

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const sessionID = this.getSessionID(ws)
		if (!sessionID) return

		this.sessionIDToWebSocket.set(sessionID, ws)
		this.getOrCreateRoom().handleSocketMessage(sessionID, message)
	}

	override async webSocketClose(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketClose')
	}

	override async webSocketError(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketError')
	}

	private handleWebSocketEnd(ws: WebSocket, method: 'handleSocketClose' | 'handleSocketError') {
		const attachment = ws.deserializeAttachment() as SocketAttachment | null
		if (!attachment?.sessionID) return

		this.sessionIDToWebSocket.delete(attachment.sessionID)

		const room = this.getOrCreateRoom()

		// If the DO was hibernating, this session was never re-added to the room
		// (ctx.getWebSockets() doesn't include the disconnecting socket). Resume it
		// briefly so the room can broadcast presence removal to other clients.
		if (attachment.snapshot && !room.getSessionSnapshot(attachment.sessionID)) {
			room.handleSocketResume({
				sessionId: attachment.sessionID,
				socket: ws,
				snapshot: attachment.snapshot,
			})
		}

		room[method](attachment.sessionID)
	}
}
