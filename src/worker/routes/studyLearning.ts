import {
	agentProfileSchema,
	agentMemoryKeySchema,
	agentMemoryProposalSchema,
	flashcardReviewRatingSchema,
	manualAgentMemorySchema,
	mistakeProposalSchema,
	registerFlashcardsSchema,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { requireSession } from '../auth/session'
import { getBoardAccess } from '../db/boards'
import { createDatabase } from '../db/client'
import {
	listBoardMistakes,
	listDueFlashcards,
	listAgentMemories,
	getStudyTodayDashboard,
	recordAgentMemory,
	recordStudyMistake,
	removeAgentMemory,
	registerFlashcards,
	reviewFlashcard,
} from '../db/studyLearning'
import { getAgentProfile, saveAgentProfile } from '../db/agentProfile'

export async function handleFlashcardRegistration(request: IRequest, env: Env) {
	const authorized = await authorizeBoard(request, env)
	if ('response' in authorized) return authorized.response
	if (authorized.role === 'viewer') return Response.json({ error: 'Forbidden' }, { status: 403 })
	const body: unknown = await request.json().catch(() => null)
	const parsed = registerFlashcardsSchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid flashcards' }, { status: 400 })
	await registerFlashcards(
		authorized.database,
		authorized.userID,
		request.params.boardID,
		parsed.data.cards
	)
	return Response.json({ registered: parsed.data.cards.length }, { status: 201 })
}

export async function handleDueFlashcards(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const reviews = await listDueFlashcards(
		createDatabase(env),
		authentication.session.user.id
	)
	return Response.json({ reviews })
}

export async function handleStudyToday(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const dashboard = await getStudyTodayDashboard(
		createDatabase(env),
		authentication.session.user.id
	)
	return Response.json(dashboard)
}

/**
 * Returns the durable memories supplied to the study agent for this user.
 * The response excludes board-scoped context and linked-service data.
 */
export async function handleStudyMemory(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const memories = await listAgentMemories(
		createDatabase(env),
		authentication.session.user.id
	)
	return Response.json({ memories })
}

/**
 * Saves a memory entered directly on the Memory page. Manual memories have no
 * source board, and a generated key gives each entry an independent delete target.
 */
export async function handleStudyMemoryCreate(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const body: unknown = await request.json().catch(() => null)
	const parsed = manualAgentMemorySchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid memory' }, { status: 400 })
	const memoryKey = `manual-${crypto.randomUUID()}`
	await recordAgentMemory(
		createDatabase(env),
		authentication.session.user.id,
		null,
		{ ...parsed.data, memoryKey }
	)
	return Response.json({ memoryKey, saved: true }, { status: 201 })
}

export async function handleAgentProfileGet(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const profile = await getAgentProfile(
		createDatabase(env),
		authentication.session.user.id
	)
	return Response.json({ profile })
}

/**
 * Replaces the signed-in user's agent profile after validating all prompt
 * switches and bounded instruction fields.
 */
export async function handleAgentProfilePut(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const body: unknown = await request.json().catch(() => null)
	const parsed = agentProfileSchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid agent profile' }, { status: 400 })
	const profile = await saveAgentProfile(
		createDatabase(env),
		authentication.session.user.id,
		parsed.data
	)
	return Response.json({ profile })
}

/**
 * Removes every saved occurrence for one stable memory key owned by the user.
 * The key is user-scoped, so it cannot remove another account's memory.
 */
export async function handleStudyMemoryDelete(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const memoryKey = agentMemoryKeySchema.safeParse(request.params.memoryKey)
	if (!memoryKey.success) return Response.json({ error: 'Invalid memory key' }, { status: 400 })
	const removed = await removeAgentMemory(
		createDatabase(env),
		authentication.session.user.id,
		memoryKey.data
	)
	if (!removed) return Response.json({ error: 'Memory not found' }, { status: 404 })
	return Response.json({ removed: true })
}

export async function handleBoardMemoryCreate(request: IRequest, env: Env) {
	const authorized = await authorizeBoard(request, env)
	if ('response' in authorized) return authorized.response
	if (authorized.role === 'viewer') return Response.json({ error: 'Forbidden' }, { status: 403 })
	const body: unknown = await request.json().catch(() => null)
	const parsed = agentMemoryProposalSchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid memory' }, { status: 400 })
	await recordAgentMemory(
		authorized.database,
		authorized.userID,
		request.params.boardID,
		parsed.data
	)
	return Response.json({ saved: true }, { status: 201 })
}

export async function handleFlashcardReview(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const body: unknown = await request.json().catch(() => null)
	const rating = flashcardReviewRatingSchema.safeParse(
		body && typeof body === 'object' ? Reflect.get(body, 'rating') : undefined
	)
	if (!rating.success) return Response.json({ error: 'Invalid review rating' }, { status: 400 })
	const schedule = await reviewFlashcard(
		createDatabase(env),
		authentication.session.user.id,
		request.params.reviewID,
		rating.data
	)
	if (!schedule) return Response.json({ error: 'Review not found' }, { status: 404 })
	return Response.json({ schedule })
}

export async function handleBoardMistakes(request: IRequest, env: Env) {
	const authorized = await authorizeBoard(request, env)
	if ('response' in authorized) return authorized.response
	if (request.method === 'GET') {
		const mistakes = await listBoardMistakes(
			authorized.database,
			authorized.userID,
			request.params.boardID
		)
		return Response.json({ mistakes })
	}
	if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
	const body: unknown = await request.json().catch(() => null)
	const parsed = mistakeProposalSchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid mistake record' }, { status: 400 })
	const mistake = await recordStudyMistake(
		authorized.database,
		authorized.userID,
		request.params.boardID,
		parsed.data
	)
	return Response.json({ mistake }, { status: 201 })
}

async function authorizeBoard(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return { response: authentication.response }
	const database = createDatabase(env)
	const access = await getBoardAccess(
		database,
		request.params.boardID,
		authentication.session.user.id
	)
	if (!access) return { response: Response.json({ error: 'Board not found' }, { status: 404 }) }
	return {
		database,
		role: access.role,
		userID: authentication.session.user.id,
	}
}
