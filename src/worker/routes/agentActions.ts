import {
	agentActionCreateSchema,
	agentActionUndoResultSchema,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { requireSession } from '../auth/session'
import {
	claimAgentActionUndo,
	createAgentAction,
	listAgentActions,
	resolveAgentActionUndo,
} from '../db/agentActions'
import { getBoardAccess } from '../db/boards'
import { createDatabase } from '../db/client'

const MAX_ACTION_BYTES = 500_000

export async function handleAgentActions(request: IRequest, env: Env) {
	const authorized = await authorizeEditor(request, env)
	if ('response' in authorized) return authorized.response
	if (request.method === 'GET') {
		const actions = await listAgentActions(
			authorized.database,
			request.params.boardID,
			authorized.userID
		)
		return Response.json({ actions })
	}
	if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
	const bodyText = await request.text()
	if (bodyText.length > MAX_ACTION_BYTES) {
		return Response.json({ error: 'AI change is too large to store safely' }, { status: 413 })
	}
	const parsed = agentActionCreateSchema.safeParse(parseJSON(bodyText))
	if (!parsed.success) return Response.json({ error: 'Invalid AI change record' }, { status: 400 })
	const action = await createAgentAction(
		authorized.database,
		request.params.boardID,
		authorized.userID,
		parsed.data
	)
	return Response.json({ action }, { status: 201 })
}

export async function handleAgentActionUndo(request: IRequest, env: Env) {
	const authorized = await authorizeEditor(request, env)
	if ('response' in authorized) return authorized.response
	if (request.method === 'POST') {
		const payload = await claimAgentActionUndo(
			authorized.database,
			request.params.boardID,
			authorized.userID,
			request.params.actionID
		)
		if (!payload) {
			return Response.json({ error: 'This AI change is not available for undo' }, { status: 409 })
		}
		return Response.json(payload)
	}
	if (request.method !== 'PATCH') return new Response('Method not allowed', { status: 405 })
	const body: unknown = await request.json().catch(() => null)
	const parsed = agentActionUndoResultSchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid undo result' }, { status: 400 })
	const action = await resolveAgentActionUndo(
		authorized.database,
		request.params.boardID,
		authorized.userID,
		request.params.actionID,
		parsed.data.completed
	)
	if (!action) return Response.json({ error: 'Undo claim not found' }, { status: 409 })
	return Response.json({ action })
}

async function authorizeEditor(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return { response: authentication.response }
	const database = createDatabase(env)
	const userID = authentication.session.user.id
	const access = await getBoardAccess(database, request.params.boardID, userID)
	if (!access) return { response: Response.json({ error: 'Space not found' }, { status: 404 }) }
	if (access.role === 'viewer') {
		return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
	}
	return { database, userID }
}

function parseJSON(value: string): unknown {
	try {
		return JSON.parse(value) as unknown
	} catch {
		return null
	}
}
