import {
	MAX_CRAFT_DOCUMENT_LINKS,
	craftConnectionInputSchema,
	craftDocumentAppendInputSchema,
	craftDocumentBlocksUpdateInputSchema,
	craftDocumentLinkInputSchema,
	craftWhiteboardSaveInputSchema,
	type CraftConnectionStatus,
	type CraftDocumentAppendOutput,
	type CraftDocumentBlocksUpdateOutput,
	type CraftWhiteboardSaveOutput,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { requireSession } from '../auth/session'
import {
	createCraftDocumentLink,
	deleteCraftDocumentLink,
	getCraftDocumentLinkRow,
	listCraftDocumentLinkRows,
	toCraftDocumentLink,
} from '../db/craft'
import { createDatabase, type Database } from '../db/client'
import {
	appendCraftDocumentMarkdown,
	CraftWhiteboardConflictError,
	connectCraftAPI,
	deleteCraftConnection,
	getCraftConnection,
	getCraftDocumentMarkdown,
	getCraftWhiteboard,
	listCraftDocumentCandidates,
	listCraftDocumentWhiteboards,
	saveCraftConnection,
	saveCraftWhiteboard,
	updateCraftDocumentBlocks,
	verifyCraftDocument,
} from '../integrations/craft'
import type { AuthorizedBoardContext } from './documents'

const MAX_CRAFT_WHITEBOARD_SAVE_BYTES = 2 * 1_024 * 1_024

export async function handleCraftConnectionGet(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const connection = await getCraftConnection(env, authentication.session.user.id)
	return Response.json({
		connected: Boolean(connection),
		connectedAt: connection?.connectedAt ?? null,
		spaceName: connection?.spaceName ?? null,
	} satisfies CraftConnectionStatus)
}

export async function handleCraftConnectionPut(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const input: unknown = await request.json().catch(() => null)
	const parsed = craftConnectionInputSchema.safeParse(input)
	if (!parsed.success) {
		return Response.json({ error: 'Enter the API URL from Craft.' }, { status: 400 })
	}

	try {
		const connection = await connectCraftAPI(parsed.data.apiURL)
		await saveCraftConnection(env, authentication.session.user.id, connection)
		return Response.json({
			connected: true,
			connectedAt: connection.connectedAt,
			spaceName: connection.spaceName,
		} satisfies CraftConnectionStatus)
	} catch (error) {
		return craftErrorResponse(error, 400)
	}
}

export async function handleCraftConnectionDelete(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	await deleteCraftConnection(env, authentication.session.user.id)
	return Response.json({ ok: true })
}

export async function handleCraftDocumentsList(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const rows = await listCraftDocumentLinkRows(createDatabase(env), request.params.boardID)
	return Response.json({
		documents: rows.map((row) => toCraftDocumentLink(row, authorization.userID)),
	})
}

export async function handleCraftCandidatesList(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const connection = await getCraftConnection(env, authorization.userID)
	if (!connection) {
		return Response.json(
			{ error: 'Connect Craft in Settings before adding documents.' },
			{ status: 409 }
		)
	}
	try {
		const candidates = await listCraftDocumentCandidates(
			connection,
			new URL(request.url).searchParams.get('q') ?? ''
		)
		return Response.json({ documents: candidates })
	} catch (error) {
		return craftErrorResponse(error)
	}
}

export async function handleCraftDocumentCreate(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const input: unknown = await request.json().catch(() => null)
	const parsed = craftDocumentLinkInputSchema.safeParse(input)
	if (!parsed.success) {
		return Response.json({ error: 'Choose a valid Craft document.' }, { status: 400 })
	}
	const database = createDatabase(env)
	const currentLinks = await listCraftDocumentLinkRows(database, request.params.boardID)
	const existing = currentLinks.find((row) =>
		row.connectionOwnerID === authorization.userID &&
		row.documentID === parsed.data.documentID
	)
	if (existing) {
		return Response.json({ document: toCraftDocumentLink(existing, authorization.userID) })
	}
	if (currentLinks.length >= MAX_CRAFT_DOCUMENT_LINKS) {
		return Response.json(
			{ error: `A space can link up to ${MAX_CRAFT_DOCUMENT_LINKS} Craft documents.` },
			{ status: 409 }
		)
	}
	const connection = await getCraftConnection(env, authorization.userID)
	if (!connection) {
		return Response.json(
			{ error: 'Connect Craft in Settings before adding documents.' },
			{ status: 409 }
		)
	}
	try {
		await verifyCraftDocument(connection, parsed.data.documentID)
		const row = await createCraftDocumentLink(database, {
			boardID: request.params.boardID,
			connectionOwnerID: authorization.userID,
			documentID: parsed.data.documentID,
			title: parsed.data.title,
		})
		return Response.json(
			{ document: toCraftDocumentLink(row, authorization.userID) },
			{ status: 201 }
		)
	} catch (error) {
		return craftErrorResponse(error)
	}
}

export async function handleCraftDocumentDelete(
	request: IRequest,
	env: Env
) {
	const database = createDatabase(env)
	const row = await getCraftDocumentLinkRow(
		database,
		request.params.boardID,
		request.params.linkID
	)
	if (!row) return Response.json({ error: 'Craft document not found.' }, { status: 404 })
	await deleteCraftDocumentLink(database, request.params.boardID, row.id)
	return Response.json({ ok: true })
}

export async function handleCraftDocumentPreview(
	request: IRequest,
	env: Env
) {
	const row = await getCraftDocumentLinkRow(
		createDatabase(env),
		request.params.boardID,
		request.params.linkID
	)
	if (!row) return Response.json({ error: 'Craft document not found.' }, { status: 404 })
	const connection = await getCraftConnection(env, row.connectionOwnerID)
	if (!connection) {
		return Response.json(
			{ error: 'The Craft connection for this document is no longer available.' },
			{ status: 409 }
		)
	}
	try {
		return Response.json({
			markdown: await getCraftDocumentMarkdown(connection, row.documentID),
			title: row.title,
		})
	} catch (error) {
		return craftErrorResponse(error)
	}
}

export async function handleCraftWhiteboardsList(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const documentID = readCraftDocumentID(request)
	if (!documentID) {
		return Response.json({ error: 'Choose a valid Craft document.' }, { status: 400 })
	}
	const connection = await getCraftConnection(env, authorization.userID)
	if (!connection) {
		return Response.json(
			{ error: 'Connect Craft in Settings before importing a whiteboard.' },
			{ status: 409 }
		)
	}
	try {
		return Response.json({
			whiteboards: await listCraftDocumentWhiteboards(connection, documentID),
		})
	} catch (error) {
		return craftErrorResponse(error)
	}
}

export async function handleCraftWhiteboardGet(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const documentID = readCraftDocumentID(request)
	if (!documentID) {
		return Response.json({ error: 'Choose a valid Craft document.' }, { status: 400 })
	}
	const connection = await getCraftConnection(env, authorization.userID)
	if (!connection) {
		return Response.json(
			{ error: 'Connect Craft in Settings before importing a whiteboard.' },
			{ status: 409 }
		)
	}
	try {
		const whiteboard = await getCraftWhiteboard(
			connection,
			documentID,
			request.params.whiteboardBlockID
		)
		return Response.json({
			...whiteboard,
			connectionOwnerID: authorization.userID,
		})
	} catch (error) {
		return craftErrorResponse(error)
	}
}

/**
 * Saves the current user's editable snapshot through their own Craft connection. The integration
 * verifies the whiteboard's document before it sends any state-changing request to Craft.
 */
export async function handleCraftWhiteboardPut(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const documentID = readCraftDocumentID(request)
	if (!documentID) {
		return Response.json({ error: 'Choose a valid Craft document.' }, { status: 400 })
	}
	const input = await readBoundedJSON(request, MAX_CRAFT_WHITEBOARD_SAVE_BYTES)
	if ('response' in input) return input.response
	const parsed = craftWhiteboardSaveInputSchema.safeParse(input.value)
	if (!parsed.success) {
		return Response.json({ error: 'The Craft whiteboard changes are invalid.' }, { status: 400 })
	}
	const connection = await getCraftConnection(env, authorization.userID)
	if (!connection) {
		return Response.json(
			{ error: 'Connect Craft in Settings before saving a whiteboard.' },
			{ status: 409 }
		)
	}
	try {
		const output = await saveCraftWhiteboard(
			connection,
			documentID,
			request.params.whiteboardBlockID,
			parsed.data.elementsToAdd,
			parsed.data.elementsToUpdate,
			parsed.data.elementIDsToDelete,
			parsed.data.expectedRevision
		)
		return Response.json(output satisfies CraftWhiteboardSaveOutput)
	} catch (error) {
		if (error instanceof CraftWhiteboardConflictError) {
			return craftErrorResponse(error, 409)
		}
		return craftErrorResponse(error)
	}
}

/**
 * Applies an agent-requested append only through the current user's Craft connection. A linked
 * document owned by another board member remains readable, but their credential cannot be used
 * for someone else's mutation.
 */
export async function appendCraftDocumentForUser(
	env: Env,
	database: Database,
	boardID: string,
	userID: string,
	input: unknown
): Promise<CraftDocumentAppendOutput> {
	const parsed = craftDocumentAppendInputSchema.parse(input)
	const row = await getCraftDocumentLinkRow(database, boardID, parsed.linkID)
	if (!row) throw new Error('That Craft document is not linked to this space.')
	if (row.connectionOwnerID !== userID) {
		throw new Error('Only the person who linked this Craft document can change it.')
	}
	const connection = await getCraftConnection(env, userID)
	if (!connection) throw new Error('Connect Craft in Settings before changing documents.')
	await appendCraftDocumentMarkdown(connection, row.documentID, parsed.markdown)
	return { added: true, title: row.title }
}

/**
 * Applies agent-requested text changes with the same ownership boundary as append operations.
 * The integration client also confirms that each block belongs to this linked document.
 */
export async function updateCraftDocumentBlocksForUser(
	env: Env,
	database: Database,
	boardID: string,
	userID: string,
	input: unknown
): Promise<CraftDocumentBlocksUpdateOutput> {
	const parsed = craftDocumentBlocksUpdateInputSchema.parse(input)
	const row = await getCraftDocumentLinkRow(database, boardID, parsed.linkID)
	if (!row) throw new Error('That Craft document is not linked to this space.')
	if (row.connectionOwnerID !== userID) {
		throw new Error('Only the person who linked this Craft document can change it.')
	}
	const connection = await getCraftConnection(env, userID)
	if (!connection) throw new Error('Connect Craft in Settings before changing documents.')
	await updateCraftDocumentBlocks(connection, row.documentID, parsed.blocks)
	return { title: row.title, updated: parsed.blocks.length }
}

function craftErrorResponse(error: unknown, status = 502) {
	const message = error instanceof Error ? error.message : 'Craft is unavailable right now.'
	return Response.json({ error: message }, { status })
}

function readCraftDocumentID(request: IRequest) {
	const documentID = new URL(request.url).searchParams.get('documentID')?.trim()
	return documentID && documentID.length <= 256 ? documentID : null
}

/**
 * Buffers only a fixed JSON body. Whiteboard saves need one atomic validation pass, while the
 * byte ceiling keeps malformed nested JSON below the Worker's memory-sensitive request path.
 */
async function readBoundedJSON(
	request: Request,
	maximumBytes: number
): Promise<{ value: unknown } | { response: Response }> {
	const declaredLength = Number(request.headers.get('content-length'))
	if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
		return {
			response: Response.json(
				{ error: 'The Craft whiteboard changes are too large.' },
				{ status: 413 }
			),
		}
	}
	if (!request.body) return { value: null }

	const reader = request.body.getReader()
	const decoder = new TextDecoder()
	let bytesRead = 0
	let text = ''
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			bytesRead += value.byteLength
			if (bytesRead > maximumBytes) {
				await reader.cancel()
				return {
					response: Response.json(
						{ error: 'The Craft whiteboard changes are too large.' },
						{ status: 413 }
					),
				}
			}
			text += decoder.decode(value, { stream: true })
		}
		text += decoder.decode()
		try {
			return { value: JSON.parse(text) as unknown }
		} catch {
			return { value: null }
		}
	} finally {
		reader.releaseLock()
	}
}
