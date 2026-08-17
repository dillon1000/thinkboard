import { readProperty } from '@agentboard/shared'
import { hasObjectType, isNumber, isString } from '@agentboard/shared'
import {
	agentProfileSchema,
	agentMemoryKeySchema,
	agentMemoryProposalSchema,
	flashcardAnswerAttemptRequestSchema,
	flashcardAnswerCompletionSchema,
	flashcardReviewRatingSchema,
	manualAgentMemorySchema,
	mistakeProposalSchema,
	registerFlashcardsSchema,
} from '@agentboard/shared'
import type { FlashcardAnswerAttemptRequest } from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { requireSession } from '../auth/session'
import { getBoardAccess } from '../db/boards'
import { createDatabase } from '../db/client'
import {
	listBoardMistakes,
	listDueFlashcards,
	listAgentMemories,
	completeFlashcardAnswerAttempt,
	getFlashcardReviewByID,
	getFlashcardReviewByShape,
	getStudyTodayDashboard,
	recordFlashcardAnswerAttempt,
	recordAgentMemory,
	recordStudyMistake,
	removeFlashcardAnswerAttempt,
	removeFlashcardAnswerAttemptsForCard,
	removeFlashcardForBoard,
	removeAgentMemory,
	registerFlashcards,
	reviewFlashcard,
} from '../db/studyLearning'
import { getAgentProfile, saveAgentProfile } from '../db/agentProfile'
import {
	gradeFlashcardAnswer,
	type AIRunner,
} from '../flashcards/answerGrading'
import { observeAIRunner } from '../observability/posthogAI'

const DEFAULT_FLASHCARD_GRADING_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'

export async function handleFlashcardRegistration(request: IRequest, env: Env) {
	const authorized = await authorizeBoard(request, env)
	if ('response' in authorized) return authorized.response
	const body: unknown = await request.json().catch(() => null)
	const parsed = registerFlashcardsSchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid flashcards' }, { status: 400 })
	await registerFlashcards(
		authorized.database,
		authorized.userID,
		request.params.boardID,
		parsed.data.cards,
		{ updateBoardMembers: authorized.role !== 'viewer' }
	)
	return Response.json({ registered: parsed.data.cards.length }, { status: 201 })
}

export async function handleFlashcardAnswerAttempt(
	request: IRequest,
	env: Env,
	ctx: ExecutionContext
) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const body: unknown = await request.json().catch(() => null)
	const parsed = flashcardAnswerAttemptRequestSchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid flashcard answer' }, { status: 400 })

	const database = createDatabase(env)
	const userID = authentication.session.user.id
	const card = parsed.data.source.kind === 'review'
		? await getFlashcardReviewByID(database, userID, parsed.data.source.reviewID)
		: await resolveCanvasFlashcard(database, userID, parsed.data.source)
	if (!card) return Response.json({ error: 'Flashcard not found' }, { status: 404 })

	const gradingModel = env.FLASHCARD_GRADING_MODEL?.trim() || DEFAULT_FLASHCARD_GRADING_MODEL
	const traceID = crypto.randomUUID()
	const grade = parsed.data.action === 'skip'
		? {
				feedback: null,
				gradingMethod: 'skipped' as const,
				matchedAnswer: null,
				model: null,
				verdict: 'skipped' as const,
			}
		: await gradeFlashcardAnswer({
				acceptedAnswers: [card.review.back, ...card.review.alternateAnswers],
				ai: observeAIRunner(env.AI as AIRunner, env, {
					defer: (capture) => ctx.waitUntil(capture),
					distinctID: userID,
					properties: {
						board_id: card.review.boardID,
						shape_id: card.review.shapeID,
						surface: 'flashcard-answer',
					},
					provider: 'cloudflare',
					sessionID: card.review.boardID,
					spanName: 'flashcard-answer',
					traceID,
				}),
				answer: parsed.data.answer,
				front: card.review.front,
				model: gradingModel,
				onAIError: (error) => {
					console.warn(JSON.stringify({
						boardID: card.review.boardID,
						error: getAIErrorLog(error),
						model: gradingModel,
						pipeline: 'flashcard-answer',
						rayID: request.headers.get('cf-ray'),
						shapeID: card.review.shapeID,
					}))
				},
				options: {
					gateway: {
						id: env.AI_GATEWAY_ID?.trim() || 'default',
						metadata: {
							boardID: card.review.boardID,
							pipeline: 'flashcard-answer',
							shapeID: card.review.shapeID,
						},
					},
					tags: ['agentboard', 'flashcard-answer'],
				},
			})
	const result = await recordFlashcardAnswerAttempt(database, userID, {
		card,
		...grade,
		submittedAnswer: parsed.data.action === 'answer' ? parsed.data.answer : null,
	})
	return Response.json(result, { status: 201 })
}

function getAIErrorLog(error: unknown) {
	const code = error && hasObjectType(error) ? readProperty(error, 'code') : null
	const message = error instanceof Error ? error.message : String(error)
	return {
		...(isNumber(code) || isString(code) ? { code } : {}),
		message: message.slice(0, 500),
		name: error instanceof Error ? error.name : 'UnknownError',
	}
}

export async function handleFlashcardAnswerAttemptComplete(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const body: unknown = await request.json().catch(() => null)
	const parsed = flashcardAnswerCompletionSchema.safeParse(body)
	if (!parsed.success) return Response.json({ error: 'Invalid answer completion' }, { status: 400 })
	const result = await completeFlashcardAnswerAttempt(
		createDatabase(env),
		authentication.session.user.id,
		request.params.attemptID,
		parsed.data.finalVerdict,
		parsed.data.rating
	)
	if (result.kind === 'not-found') {
		return Response.json({ error: 'Answer attempt not found' }, { status: 404 })
	}
	if (result.kind === 'rating-required') {
		return Response.json({ error: 'A due answer requires a review rating' }, { status: 400 })
	}
	return Response.json(result.result)
}

export async function handleFlashcardAnswerAttemptDelete(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const removed = await removeFlashcardAnswerAttempt(
		createDatabase(env),
		authentication.session.user.id,
		request.params.attemptID
	)
	if (!removed) return Response.json({ error: 'Answer attempt not found' }, { status: 404 })
	return Response.json({ removed: true })
}

export async function handleFlashcardAnswerAttemptsForCardDelete(request: IRequest, env: Env) {
	const authorized = await authorizeBoard(request, env)
	if ('response' in authorized) return authorized.response
	const removed = await removeFlashcardAnswerAttemptsForCard(
		authorized.database,
		authorized.userID,
		request.params.boardID,
		request.params.shapeID
	)
	return Response.json({ removed })
}

export async function handleFlashcardDelete(request: IRequest, env: Env) {
	const authorized = await authorizeBoard(request, env)
	if ('response' in authorized) return authorized.response
	if (authorized.role === 'viewer') return Response.json({ error: 'Forbidden' }, { status: 403 })
	await removeFlashcardForBoard(
		authorized.database,
		request.params.boardID,
		request.params.shapeID
	)
	return Response.json({ removed: true })
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
		body && hasObjectType(body) ? readProperty(body, 'rating') : undefined
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
	if (!access) return { response: Response.json({ error: 'Space not found' }, { status: 404 }) }
	return {
		database,
		role: access.role,
		userID: authentication.session.user.id,
	}
}

async function resolveCanvasFlashcard(
	database: ReturnType<typeof createDatabase>,
	userID: string,
	source: Extract<FlashcardAnswerAttemptRequest['source'], { kind: 'canvas' }>
) {
	const access = await getBoardAccess(database, source.boardID, userID)
	if (!access) return null
	await registerFlashcards(database, userID, source.boardID, [{
		alternateAnswers: source.alternateAnswers,
		back: source.back,
		front: source.front,
		shapeID: source.shapeID,
	}], { updateBoardMembers: access.role !== 'viewer' })
	return getFlashcardReviewByShape(database, userID, source.boardID, source.shapeID)
}
