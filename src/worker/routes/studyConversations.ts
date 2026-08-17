import { getBoardAccess } from '../db/boards'
import { createDatabase } from '../db/client'
import type { Database } from '../db/client'
import {
	createStudyConversation,
	listStudyConversations,
	updateStudyConversation,
} from '../db/studyConversations'
import { requireSession } from '../auth/session'
import type { IRequest } from 'itty-router'
import {
	DEFAULT_CONVERSATION_TITLE_MODEL,
	generateConversationTitle,
} from '../agents/conversationTitle'
import type { AIRunner } from './lockIn'
import { observeAIRunner } from '../observability/posthogAI'

const MAX_TITLE_LENGTH = 80
const MAX_TITLE_SOURCE_LENGTH = 2_000

type ConversationAuthorization =
	| { database: Database; userID: string }
	| { response: Response }

export async function handleStudyConversationsList(request: IRequest, env: Env) {
	const authorized = await authorize(request, env)
	if ('response' in authorized) return authorized.response
	const conversations = await listStudyConversations(
		authorized.database,
		request.params.boardID,
		authorized.userID
	)
	return Response.json({ conversations })
}

export async function handleStudyConversationCreate(request: IRequest, env: Env) {
	const authorized = await authorize(request, env)
	if ('response' in authorized) return authorized.response
	const conversation = await createStudyConversation(
		authorized.database,
		request.params.boardID,
		authorized.userID
	)
	return Response.json({ conversation }, { status: 201 })
}

export async function handleStudyConversationUpdate(request: IRequest, env: Env) {
	const authorized = await authorize(request, env)
	if ('response' in authorized) return authorized.response
	const title = await readOptionalTitle(request)
	if (title === null) return Response.json({ error: 'Invalid conversation title' }, { status: 400 })
	const conversation = await updateStudyConversation(
		authorized.database,
		request.params.boardID,
		authorized.userID,
		request.params.conversationID,
		title
	)
	if (!conversation) return Response.json({ error: 'Conversation not found' }, { status: 404 })
	return Response.json({ conversation })
}

export async function handleStudyConversationTitle(
	request: IRequest,
	env: Env,
	ctx: ExecutionContext
) {
	const authorized = await authorize(request, env)
	if ('response' in authorized) return authorized.response

	const message = await readTitleSource(request)
	if (!message) return Response.json({ error: 'A message is required to name the conversation' }, { status: 400 })

	const boardID = request.params.boardID
	const conversationID = request.params.conversationID
	let title: string | null = null
	try {
		title = await generateConversationTitle(
			observeAIRunner(env.AI as AIRunner, env, {
				defer: (capture) => ctx.waitUntil(capture),
				distinctID: authorized.userID,
				properties: { board_id: boardID, surface: 'conversation-title' },
				provider: 'cloudflare',
				sessionID: conversationID,
				spanName: 'conversation-title',
				traceID: crypto.randomUUID(),
			}),
			env.CONVERSATION_TITLE_MODEL?.trim() || DEFAULT_CONVERSATION_TITLE_MODEL,
			message,
			{
				gateway: {
					id: env.AI_GATEWAY_ID ?? 'default',
					metadata: { boardID, conversationID, pipeline: 'conversation-title' },
				},
				tags: ['agentboard', 'conversation-title'],
			}
		)
	} catch (error) {
		console.error(JSON.stringify({
			boardID,
			conversationID,
			error: error instanceof Error ? error.message : 'Unknown conversation title error',
			pipeline: 'conversation-title',
		}))
	}

	/** Fall back to a trimmed excerpt so a naming outage never leaves "New conversation". */
	const resolved = title ?? fallbackTitle(message)
	const conversation = await updateStudyConversation(
		authorized.database,
		boardID,
		authorized.userID,
		conversationID,
		resolved
	)
	if (!conversation) return Response.json({ error: 'Conversation not found' }, { status: 404 })
	return Response.json({ conversation })
}

async function authorize(request: IRequest, env: Env): Promise<ConversationAuthorization> {
	const authentication = await requireSession(request, env)
	if (authentication.response) return { response: authentication.response }
	const database = createDatabase(env)
	const access = await getBoardAccess(
		database,
		request.params.boardID,
		authentication.session.user.id
	)
	if (!access) return { response: Response.json({ error: 'Space not found' }, { status: 404 }) }
	return { database, userID: authentication.session.user.id }
}

async function readOptionalTitle(request: Request) {
	const body: unknown = await request.json().catch(() => ({}))
	if (!body || typeof body !== 'object') return null
	const value = Reflect.get(body, 'title')
	if (value === undefined) return undefined
	if (typeof value !== 'string') return null
	const title = value.trim().replace(/\s+/g, ' ')
	return title ? title.slice(0, MAX_TITLE_LENGTH) : null
}

async function readTitleSource(request: Request): Promise<string | null> {
	const body: unknown = await request.json().catch(() => ({}))
	if (!body || typeof body !== 'object') return null
	const value = Reflect.get(body, 'message')
	if (typeof value !== 'string') return null
	const message = value.trim().replace(/\s+/g, ' ')
	return message ? message.slice(0, MAX_TITLE_SOURCE_LENGTH) : null
}

function fallbackTitle(message: string): string {
	const normalized = message.trim().replace(/\s+/g, ' ')
	return normalized.length > 52 ? `${normalized.slice(0, 51).trimEnd()}…` : normalized
}
