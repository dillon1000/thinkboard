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

const MAX_TITLE_LENGTH = 80

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

async function authorize(request: IRequest, env: Env): Promise<ConversationAuthorization> {
	const authentication = await requireSession(request, env)
	if (authentication.response) return { response: authentication.response }
	const database = createDatabase(env)
	const access = await getBoardAccess(
		database,
		request.params.boardID,
		authentication.session.user.id
	)
	if (!access) return { response: Response.json({ error: 'Board not found' }, { status: 404 }) }
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
