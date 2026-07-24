import { getBoardAccess } from '../db/boards'
import { createDatabase } from '../db/client'
import { getStudyConversation } from '../db/studyConversations'
import { requireSession } from '../auth/session'
import type { IRequest } from 'itty-router'

export async function handleStudyConversationMessages(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const database = createDatabase(env)
	const userID = authentication.session.user.id
	const access = await getBoardAccess(database, request.params.boardID, userID)
	if (!access) return Response.json({ error: 'Board not found' }, { status: 404 })

	const conversation = await getStudyConversation(
		database,
		request.params.boardID,
		request.params.conversationID,
		userID
	)
	if (!conversation) {
		return Response.json({ error: 'Conversation not found' }, { status: 404 })
	}

	return forwardStudyAgentRequest(
		env.StudyAgent.getByName(conversation.agentName),
		request,
		{ boardID: request.params.boardID, userID }
	)
}

/**
 * Cursor-invoked requests are one-shot, so they never touch a saved conversation. They still run
 * through a Durable Object — the agent lives there — but on a per-student instance that stores
 * nothing, which keeps an inline aside out of the panel's history.
 */
export async function handleInlineAgentRequest(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const database = createDatabase(env)
	const userID = authentication.session.user.id
	const boardID = request.params.boardID
	const access = await getBoardAccess(database, boardID, userID)
	if (!access) return Response.json({ error: 'Board not found' }, { status: 404 })

	return forwardStudyAgentRequest(
		env.StudyAgent.getByName(`inline:${boardID}:${userID}`),
		request,
		{ boardID, userID }
	)
}

interface StudyAgentFetcher {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export function forwardStudyAgentRequest(
	stub: StudyAgentFetcher,
	request: Request,
	identity?: { boardID: string; userID: string }
) {
	const headers = new Headers(request.headers)
	if (identity) {
		headers.set('x-agentboard-board-id', identity.boardID)
		headers.set('x-agentboard-user-id', identity.userID)
	}
	return stub.fetch(request.url, {
		method: request.method,
		headers,
		body: request.body,
		signal: request.signal,
	})
}
