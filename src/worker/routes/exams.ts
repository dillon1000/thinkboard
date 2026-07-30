import {
	examPlanInputSchema,
	registerStudyArtifactsSchema,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { requireSession } from '../auth/session'
import { getBoardAccess } from '../db/boards'
import { createDatabase } from '../db/client'
import {
	createExamPlan,
	listExamPlans,
	registerStudyArtifacts,
	removeExamPlan,
	removeStudyArtifact,
} from '../db/exams'
import { buildExamPracticeSet } from '../exams/practice'

export async function handleExamPlans(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const database = createDatabase(env)
	const userID = authentication.session.user.id
	if (request.method === 'GET') {
		return Response.json({ exams: await listExamPlans(database, userID) })
	}
	const parsed = examPlanInputSchema.safeParse(await readBody(request))
	if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
	const created = await createExamPlan(database, userID, parsed.data)
	return created
		? Response.json({ exam: created }, { status: 201 })
		: Response.json({ error: 'One or more study sources are unavailable' }, { status: 404 })
}

export async function handleExamPlan(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const removed = await removeExamPlan(
		createDatabase(env),
		authentication.session.user.id,
		request.params.examID
	)
	return removed
		? new Response(null, { status: 204 })
		: Response.json({ error: 'Exam plan not found' }, { status: 404 })
}

export async function handleExamPractice(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const practice = await buildExamPracticeSet(
		createDatabase(env),
		env,
		authentication.session.user.id,
		request.params.examID
	)
	if (!practice) return Response.json({ error: 'Exam plan not found' }, { status: 404 })
	if (!practice.proposal) {
		return Response.json(
			{ error: 'Add two quiz or flashcard shapes, or select a processed PDF' },
			{ status: 409 }
		)
	}
	return Response.json({ practice })
}

export async function handleBoardArtifacts(request: IRequest, env: Env) {
	const authorization = await authorizeEditableBoard(request, env)
	if ('response' in authorization) return authorization.response
	const parsed = registerStudyArtifactsSchema.safeParse(await readBody(request))
	if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)
	await registerStudyArtifacts(
		authorization.database,
		request.params.boardID,
		parsed.data.artifacts
	)
	return Response.json({ registered: parsed.data.artifacts.length }, { status: 201 })
}

export async function handleBoardArtifact(request: IRequest, env: Env) {
	const authorization = await authorizeEditableBoard(request, env)
	if ('response' in authorization) return authorization.response
	await removeStudyArtifact(
		authorization.database,
		request.params.boardID,
		request.params.shapeID
	)
	return new Response(null, { status: 204 })
}

async function authorizeEditableBoard(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return { response: authentication.response }
	const database = createDatabase(env)
	const access = await getBoardAccess(
		database,
		request.params.boardID,
		authentication.session.user.id
	)
	if (!access) return { response: Response.json({ error: 'Space not found' }, { status: 404 }) }
	if (access.role === 'viewer') {
		return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
	}
	return { database }
}

async function readBody(request: Request): Promise<unknown> {
	return request.json().catch(() => null)
}

function invalidInput(message = 'Invalid request') {
	return Response.json({ error: message }, { status: 400 })
}
