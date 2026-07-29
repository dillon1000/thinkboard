import {
	agentMemoryKeySchema,
	agentMemoryProposalSchema,
	flashcardReviewRatingSchema,
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
	recordAgentMemory,
	recordStudyMistake,
	removeAgentMemory,
	registerFlashcards,
	reviewFlashcard,
} from '../db/studyLearning'

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
