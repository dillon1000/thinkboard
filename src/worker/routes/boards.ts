import { readProperty } from '@agentboard/shared'
import { hasObjectType, isString } from '@agentboard/shared'
import {
	archiveBoard,
	createBoard,
	getBoard,
	getBoardAccess,
	listArchivedBoards,
	listBoards,
	renameBoard,
	restoreBoard,
} from '../db/boards'
import { createDatabase } from '../db/client'
import { requireSession } from '../auth/session'
import type { IRequest } from 'itty-router'

const MAX_TITLE_LENGTH = 120

export async function handleBoardsList(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const boards = await listBoards(createDatabase(env), authentication.session.user.id)
	return Response.json({ boards })
}

export async function handleArchivedBoardsList(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const boards = await listArchivedBoards(createDatabase(env), authentication.session.user.id)
	return Response.json({ boards })
}

export async function handleBoardCreate(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const title = await readTitle(request)
	if (!title) return Response.json({ error: 'A space title is required' }, { status: 400 })

	const createdBoard = await createBoard(createDatabase(env), authentication.session.user.id, title)
	return Response.json({ board: createdBoard }, { status: 201 })
}

export async function handleBoardGet(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const foundBoard = await getBoard(
		createDatabase(env),
		request.params.boardID,
		authentication.session.user.id
	)
	if (!foundBoard) return Response.json({ error: 'Space not found' }, { status: 404 })
	return Response.json({ board: foundBoard })
}

export async function handleBoardRename(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const database = createDatabase(env)
	const access = await getBoardAccess(database, request.params.boardID, authentication.session.user.id)
	if (!access) return Response.json({ error: 'Space not found' }, { status: 404 })
	if (access.role === 'viewer') return Response.json({ error: 'Forbidden' }, { status: 403 })

	const title = await readTitle(request)
	if (!title) return Response.json({ error: 'A space title is required' }, { status: 400 })

	await renameBoard(database, access.boardID, title)
	return Response.json({ ok: true })
}

export async function handleBoardArchive(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const database = createDatabase(env)
	const access = await getBoardAccess(database, request.params.boardID, authentication.session.user.id)
	if (!access) return Response.json({ error: 'Space not found' }, { status: 404 })
	if (access.role !== 'owner') return Response.json({ error: 'Only an owner can archive a space' }, { status: 403 })

	await archiveBoard(database, access.boardID)
	return new Response(null, { status: 204 })
}

export async function handleBoardRestore(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const database = createDatabase(env)
	const archivedBoards = await listArchivedBoards(database, authentication.session.user.id)
	const archivedBoard = archivedBoards.find(({ id }) => id === request.params.boardID)
	if (!archivedBoard) return Response.json({ error: 'Archived space not found' }, { status: 404 })

	await restoreBoard(database, archivedBoard.id)
	return Response.json({
		board: { ...archivedBoard, updatedAt: new Date().toISOString() },
	})
}

async function readTitle(request: Request) {
	const body: unknown = await request.json().catch(() => null)
	if (!body || !hasObjectType(body)) return null
	const title = readProperty(body, 'title')
	if (!isString(title)) return null
	const normalized = title.trim().replace(/\s+/g, ' ')
	return normalized ? normalized.slice(0, MAX_TITLE_LENGTH) : null
}
