import {
	boardCourseUpdateSchema,
	courseInputSchema,
	courseUpdateSchema,
	spaceInvitationInputSchema,
	spaceMemberRoleUpdateSchema,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { z } from 'zod'
import { requireSession } from '../auth/session'
import { getBoardAccess } from '../db/boards'
import { createDatabase } from '../db/client'
import {
	acceptSpaceInvitation,
	createCourse,
	createSpaceInvitation,
	getSpaceInvitationPreview,
	listCourses,
	listSpaceInvitations,
	listSpaceMembers,
	removeCourse,
	removeSpaceInvitation,
	removeSpaceMember,
	setBoardCourse,
	updateCourse,
	updateSpaceMemberRole,
} from '../db/workspace'

export async function handleCourses(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const database = createDatabase(env)
	if (request.method === 'GET') {
		return Response.json({ courses: await listCourses(database, authentication.session.user.id) })
	}
	const parsed = courseInputSchema.safeParse(await readBody(request))
	if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
	const createdCourse = await createCourse(database, authentication.session.user.id, parsed.data)
	return Response.json({ course: createdCourse }, { status: 201 })
}

export async function handleCourse(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const database = createDatabase(env)
	if (request.method === 'DELETE') {
		const removed = await removeCourse(
			database,
			authentication.session.user.id,
			request.params.courseID
		)
		return removed
			? new Response(null, { status: 204 })
			: Response.json({ error: 'Course not found' }, { status: 404 })
	}
	const parsed = courseUpdateSchema.safeParse(await readBody(request))
	if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
	const updatedCourse = await updateCourse(
		database,
		authentication.session.user.id,
		request.params.courseID,
		parsed.data
	)
	return updatedCourse
		? Response.json({ course: updatedCourse })
		: Response.json({ error: 'Course not found' }, { status: 404 })
}

export async function handleBoardCourse(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const database = createDatabase(env)
	const access = await getBoardAccess(database, request.params.boardID, authentication.session.user.id)
	if (!access) return Response.json({ error: 'Space not found' }, { status: 404 })
	if (access.role !== 'owner') {
		return Response.json({ error: 'Only the owner can change a space course' }, { status: 403 })
	}
	const parsed = boardCourseUpdateSchema.safeParse(await readBody(request))
	if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
	const updated = await setBoardCourse(
		database,
		authentication.session.user.id,
		access.boardID,
		parsed.data.courseID
	)
	return updated
		? Response.json({ ok: true })
		: Response.json({ error: 'Course not found' }, { status: 404 })
}

export async function handleBoardMembers(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const database = createDatabase(env)
	const access = await getBoardAccess(database, request.params.boardID, authentication.session.user.id)
	if (!access) return Response.json({ error: 'Space not found' }, { status: 404 })
	return Response.json({
		members: await listSpaceMembers(database, access.boardID),
		role: access.role,
	})
}

export async function handleBoardMember(request: IRequest, env: Env) {
	const owner = await requireBoardOwner(request, env)
	if ('response' in owner) return owner.response
	if (request.method === 'DELETE') {
		const removed = await removeSpaceMember(
			owner.database,
			owner.boardID,
			request.params.userID
		)
		return removed
			? new Response(null, { status: 204 })
			: Response.json({ error: 'Member not found' }, { status: 404 })
	}
	const parsed = spaceMemberRoleUpdateSchema.safeParse(await readBody(request))
	if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
	const updated = await updateSpaceMemberRole(
		owner.database,
		owner.boardID,
		request.params.userID,
		parsed.data.role
	)
	return updated
		? Response.json({ ok: true })
		: Response.json({ error: 'Member not found' }, { status: 404 })
}

export async function handleBoardInvitations(request: IRequest, env: Env) {
	const owner = await requireBoardOwner(request, env)
	if ('response' in owner) return owner.response
	if (request.method === 'GET') {
		return Response.json({
			invitations: await listSpaceInvitations(owner.database, owner.boardID),
		})
	}
	const parsed = spaceInvitationInputSchema.safeParse(await readBody(request))
	if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
	const invitation = await createSpaceInvitation(
		owner.database,
		owner.boardID,
		owner.userID,
		parsed.data.role,
		parsed.data.email ?? null
	)
	return Response.json({ invitation }, { status: 201 })
}

export async function handleBoardInvitation(request: IRequest, env: Env) {
	const owner = await requireBoardOwner(request, env)
	if ('response' in owner) return owner.response
	const removed = await removeSpaceInvitation(
		owner.database,
		owner.boardID,
		request.params.invitationID
	)
	return removed
		? new Response(null, { status: 204 })
		: Response.json({ error: 'Invitation not found' }, { status: 404 })
}

export async function handleInvitation(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const database = createDatabase(env)
	if (request.method === 'GET') {
		const invitation = await getSpaceInvitationPreview(database, request.params.token)
		return invitation
			? Response.json({ invitation })
			: Response.json({ error: 'Invitation not found or expired' }, { status: 404 })
	}
	const result = await acceptSpaceInvitation(
		database,
		request.params.token,
		authentication.session.user.id,
		authentication.session.user.email
	)
	if (result.kind === 'not-found') {
		return Response.json({ error: 'Invitation not found or expired' }, { status: 404 })
	}
	if (result.kind === 'email-mismatch') {
		return Response.json(
			{ error: 'This invitation is for a different email address' },
			{ status: 403 }
		)
	}
	return Response.json({ boardID: result.boardID })
}

interface BoardOwnerContext {
	boardID: string
	database: ReturnType<typeof createDatabase>
	userID: string
}

async function requireBoardOwner(
	request: IRequest,
	env: Env
): Promise<BoardOwnerContext | { response: Response }> {
	const authentication = await requireSession(request, env)
	if ('response' in authentication && authentication.response) {
		return { response: authentication.response }
	}
	if (!('session' in authentication) || !authentication.session) {
		return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
	}
	const database = createDatabase(env)
	const access = await getBoardAccess(database, request.params.boardID, authentication.session.user.id)
	if (!access) return { response: Response.json({ error: 'Space not found' }, { status: 404 }) }
	if (access.role !== 'owner') {
		return { response: Response.json({ error: 'Only the owner can manage access' }, { status: 403 }) }
	}
	return {
		boardID: access.boardID,
		database,
		userID: authentication.session.user.id,
	}
}

async function readBody(request: Request) {
	const body = await request.json().catch(() => null)
	return z.json().catch(null).parse(body)
}

function invalidInput(message = 'Invalid request') {
	return Response.json({ error: message }, { status: 400 })
}
