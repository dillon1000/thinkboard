import type {
	AgentMemory,
	AgentMemoryProposal,
	DueFlashcard,
	FlashcardAnswerAttempt,
	FlashcardAnswerCompletionResult,
	FlashcardAnswerVerdict,
	FlashcardFinalVerdict,
	FlashcardGradingMethod,
	FlashcardReviewRating,
	MistakeProposal,
	StudyMistake,
	StudyTodayDashboard,
	StudyTodayPattern,
	StudyTodayTrendDay,
} from '@agentboard/shared'
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import type { Database } from './client'
import {
	board,
	boardMember,
	flashcardAnswerAttempt,
	flashcardReview,
	flashcardReviewEvent,
	studyMistake,
} from './schema'
import { listExamPlans } from './exams'

const DAY_MS = 86_400_000

interface FlashcardRegistration {
	alternateAnswers: string[]
	back: string
	front: string
	shapeID: string
}

interface RegisterFlashcardOptions {
	updateBoardMembers?: boolean
}

export async function registerFlashcards(
	database: Database,
	userID: string,
	boardID: string,
	cards: readonly FlashcardRegistration[],
	options: RegisterFlashcardOptions = {},
	now = new Date()
) {
	for (const card of cards) {
		const scope = options.updateBoardMembers
			? and(eq(flashcardReview.boardID, boardID), eq(flashcardReview.shapeID, card.shapeID))
			: and(
					eq(flashcardReview.userID, userID),
					eq(flashcardReview.boardID, boardID),
					eq(flashcardReview.shapeID, card.shapeID)
				)
		const existing = await database.select().from(flashcardReview).where(scope)
		const materialChange = existing.some((review) => isMaterialFlashcardChange(review, card))
		if (existing.length) {
			await database.update(flashcardReview).set({
				alternateAnswers: card.alternateAnswers,
				front: card.front,
				back: card.back,
				...(materialChange ? {
					easeFactor: 2.5,
					intervalDays: 0,
					lastReviewedAt: null,
					nextReviewAt: now,
					repetition: 0,
					reviewCount: 0,
				} : {}),
				updatedAt: now,
			}).where(scope)
		}
		if (!existing.some((review) => review.userID === userID)) {
			await database.insert(flashcardReview).values({
				id: crypto.randomUUID(),
				userID,
				boardID,
				shapeID: card.shapeID,
				front: card.front,
				back: card.back,
				alternateAnswers: card.alternateAnswers,
				nextReviewAt: now,
				createdAt: now,
				updatedAt: now,
			})
		}
	}
}

export function isMaterialFlashcardChange(
	current: Pick<FlashcardRegistration, 'front' | 'back'>,
	next: Pick<FlashcardRegistration, 'front' | 'back'>
) {
	return current.front !== next.front || current.back !== next.back
}

export async function getFlashcardReviewByID(
	database: Database,
	userID: string,
	reviewID: string
) {
	const [row] = await database.select({
		boardTitle: board.title,
		review: flashcardReview,
	}).from(flashcardReview)
		.innerJoin(board, eq(board.id, flashcardReview.boardID))
		.innerJoin(boardMember, and(
			eq(boardMember.boardID, flashcardReview.boardID),
			eq(boardMember.userID, userID)
		))
		.where(and(
			eq(flashcardReview.id, reviewID),
			eq(flashcardReview.userID, userID),
			isNull(board.archivedAt)
		))
		.limit(1)
	return row ?? null
}

export async function getFlashcardReviewByShape(
	database: Database,
	userID: string,
	boardID: string,
	shapeID: string
) {
	const [row] = await database.select({
		boardTitle: board.title,
		review: flashcardReview,
	}).from(flashcardReview)
		.innerJoin(board, eq(board.id, flashcardReview.boardID))
		.innerJoin(boardMember, and(
			eq(boardMember.boardID, flashcardReview.boardID),
			eq(boardMember.userID, userID)
		))
		.where(and(
			eq(flashcardReview.userID, userID),
			eq(flashcardReview.boardID, boardID),
			eq(flashcardReview.shapeID, shapeID),
			isNull(board.archivedAt)
		))
		.limit(1)
	return row ?? null
}

export async function listDueFlashcards(
	database: Database,
	userID: string,
	now = new Date()
): Promise<DueFlashcard[]> {
	const rows = await database.select({
		alternateAnswers: flashcardReview.alternateAnswers,
		back: flashcardReview.back,
		boardID: flashcardReview.boardID,
		boardTitle: board.title,
		dueAt: flashcardReview.nextReviewAt,
		front: flashcardReview.front,
		reviewCount: flashcardReview.reviewCount,
		reviewID: flashcardReview.id,
		shapeID: flashcardReview.shapeID,
	}).from(flashcardReview)
		.innerJoin(board, eq(board.id, flashcardReview.boardID))
		.innerJoin(boardMember, and(
			eq(boardMember.boardID, flashcardReview.boardID),
			eq(boardMember.userID, flashcardReview.userID)
		))
		.where(and(
			eq(flashcardReview.userID, userID),
			lte(flashcardReview.nextReviewAt, now),
			isNull(board.archivedAt)
		))
		.orderBy(flashcardReview.nextReviewAt)

	return rows.map((row) => ({ ...row, dueAt: row.dueAt.toISOString() }))
}

interface RecordAnswerAttemptInput {
	card: NonNullable<Awaited<ReturnType<typeof getFlashcardReviewByID>>>
	feedback: string | null
	gradingMethod: FlashcardGradingMethod
	matchedAnswer: string | null
	model: string | null
	submittedAnswer: string | null
	verdict: FlashcardAnswerVerdict
}

export async function recordFlashcardAnswerAttempt(
	database: Database,
	userID: string,
	input: RecordAnswerAttemptInput,
	now = new Date()
) {
	const isDue = input.card.review.nextReviewAt <= now
	const value: typeof flashcardAnswerAttempt.$inferInsert = {
		id: crypto.randomUUID(),
		userID,
		boardID: input.card.review.boardID,
		shapeID: input.card.review.shapeID,
		reviewID: input.card.review.id,
		reviewCountAtAttempt: isDue ? input.card.review.reviewCount : null,
		front: input.card.review.front,
		primaryAnswer: input.card.review.back,
		alternateAnswers: input.card.review.alternateAnswers,
		submittedAnswer: input.submittedAnswer,
		originalVerdict: input.verdict,
		finalVerdict: input.verdict === 'uncertain' ? null : input.verdict,
		gradingMethod: input.gradingMethod,
		matchedAnswer: input.matchedAnswer,
		feedback: input.feedback,
		model: input.model,
		createdAt: now,
	}
	await database.insert(flashcardAnswerAttempt).values(value)
	return {
		attempt: toFlashcardAnswerAttempt({
			...value,
			completedAt: null,
			finalVerdict: value.finalVerdict ?? null,
			feedback: value.feedback ?? null,
			matchedAnswer: value.matchedAnswer ?? null,
			model: value.model ?? null,
			rating: null,
			reviewCountAtAttempt: value.reviewCountAtAttempt ?? null,
			reviewID: value.reviewID ?? null,
			submittedAnswer: value.submittedAnswer ?? null,
		}, input.card.boardTitle),
		isDue,
	}
}

export async function listRecentFlashcardAnswerAttempts(
	database: Database,
	userID: string,
	limit = 20
): Promise<FlashcardAnswerAttempt[]> {
	const rows = await database.select({
		attempt: flashcardAnswerAttempt,
		boardTitle: board.title,
	}).from(flashcardAnswerAttempt)
		.innerJoin(board, eq(board.id, flashcardAnswerAttempt.boardID))
		.where(and(eq(flashcardAnswerAttempt.userID, userID), isNull(board.archivedAt)))
		.orderBy(desc(flashcardAnswerAttempt.createdAt))
		.limit(limit)
	return rows.map(({ attempt, boardTitle }) => toFlashcardAnswerAttempt(attempt, boardTitle))
}

export async function completeFlashcardAnswerAttempt(
	database: Database,
	userID: string,
	attemptID: string,
	finalVerdict: FlashcardFinalVerdict,
	rating: FlashcardReviewRating | undefined,
	now = new Date()
): Promise<
	| { kind: 'completed'; result: FlashcardAnswerCompletionResult }
	| { kind: 'not-found' }
	| { kind: 'rating-required' }
> {
	const [row] = await database.select({
		attempt: flashcardAnswerAttempt,
		boardTitle: board.title,
	}).from(flashcardAnswerAttempt)
		.innerJoin(board, eq(board.id, flashcardAnswerAttempt.boardID))
		.where(and(
			eq(flashcardAnswerAttempt.id, attemptID),
			eq(flashcardAnswerAttempt.userID, userID)
		))
		.limit(1)
	if (!row) return { kind: 'not-found' }
	if (row.attempt.completedAt) {
		return {
			kind: 'completed',
			result: {
				attempt: toFlashcardAnswerAttempt(row.attempt, row.boardTitle),
				schedule: null,
			},
		}
	}

	const isDueAttempt = row.attempt.reviewCountAtAttempt !== null
	if (isDueAttempt && !rating) return { kind: 'rating-required' }
	const completedAttempt = {
		...row.attempt,
		completedAt: now,
		finalVerdict,
		rating: isDueAttempt ? rating ?? null : null,
	}
	if (!isDueAttempt || !row.attempt.reviewID || !rating) {
		await database.update(flashcardAnswerAttempt).set({
			completedAt: now,
			finalVerdict,
		}).where(and(
			eq(flashcardAnswerAttempt.id, attemptID),
			eq(flashcardAnswerAttempt.userID, userID),
			isNull(flashcardAnswerAttempt.completedAt)
		))
		return {
			kind: 'completed',
			result: {
				attempt: toFlashcardAnswerAttempt(completedAttempt, row.boardTitle),
				schedule: null,
			},
		}
	}

	const [review] = await database.select().from(flashcardReview).where(and(
		eq(flashcardReview.id, row.attempt.reviewID),
		eq(flashcardReview.userID, userID)
	)).limit(1)
	if (!review || review.reviewCount !== row.attempt.reviewCountAtAttempt) {
		await database.update(flashcardAnswerAttempt).set({
			completedAt: now,
			finalVerdict,
		}).where(and(
			eq(flashcardAnswerAttempt.id, attemptID),
			eq(flashcardAnswerAttempt.userID, userID),
			isNull(flashcardAnswerAttempt.completedAt)
		))
		return {
			kind: 'completed',
			result: {
				attempt: toFlashcardAnswerAttempt({
					...completedAttempt,
					rating: null,
				}, row.boardTitle),
				schedule: null,
			},
		}
	}

	const schedule = calculateReviewSchedule(review, rating)
	const nextReviewAt = new Date(now.getTime() + schedule.intervalDays * DAY_MS)
	await database.batch([
		database.update(flashcardAnswerAttempt).set({
			completedAt: now,
			finalVerdict,
			rating,
		}).where(and(
			eq(flashcardAnswerAttempt.id, attemptID),
			eq(flashcardAnswerAttempt.userID, userID),
			isNull(flashcardAnswerAttempt.completedAt)
		)),
		database.update(flashcardReview).set({
			...schedule,
			lastReviewedAt: now,
			nextReviewAt,
			reviewCount: review.reviewCount + 1,
			updatedAt: now,
		}).where(and(
			eq(flashcardReview.id, review.id),
			eq(flashcardReview.userID, userID),
			eq(flashcardReview.reviewCount, row.attempt.reviewCountAtAttempt)
		)),
		database.insert(flashcardReviewEvent).values({
			id: `answer:${attemptID}`,
			userID,
			boardID: review.boardID,
			reviewID: review.id,
			rating,
			intervalDays: schedule.intervalDays,
			easeFactor: schedule.easeFactor,
			reviewedAt: now,
		}).onConflictDoNothing(),
	])
	return {
		kind: 'completed',
		result: {
			attempt: toFlashcardAnswerAttempt(completedAttempt, row.boardTitle),
			schedule: { nextReviewAt: nextReviewAt.toISOString(), ...schedule },
		},
	}
}

export async function removeFlashcardAnswerAttempt(
	database: Database,
	userID: string,
	attemptID: string
) {
	const removed = await database.delete(flashcardAnswerAttempt)
		.where(and(
			eq(flashcardAnswerAttempt.id, attemptID),
			eq(flashcardAnswerAttempt.userID, userID)
		))
		.returning({ id: flashcardAnswerAttempt.id })
	return removed.length
}

export async function removeFlashcardAnswerAttemptsForCard(
	database: Database,
	userID: string,
	boardID: string,
	shapeID: string
) {
	const removed = await database.delete(flashcardAnswerAttempt)
		.where(and(
			eq(flashcardAnswerAttempt.userID, userID),
			eq(flashcardAnswerAttempt.boardID, boardID),
			eq(flashcardAnswerAttempt.shapeID, shapeID)
		))
		.returning({ id: flashcardAnswerAttempt.id })
	return removed.length
}

export async function removeFlashcardForBoard(
	database: Database,
	boardID: string,
	shapeID: string
) {
	await database.batch([
		database.delete(flashcardAnswerAttempt).where(and(
			eq(flashcardAnswerAttempt.boardID, boardID),
			eq(flashcardAnswerAttempt.shapeID, shapeID)
		)),
		database.delete(flashcardReview).where(and(
			eq(flashcardReview.boardID, boardID),
			eq(flashcardReview.shapeID, shapeID)
		)),
	])
}

export async function reviewFlashcard(
	database: Database,
	userID: string,
	reviewID: string,
	rating: FlashcardReviewRating,
	now = new Date()
) {
	const [current] = await database.select().from(flashcardReview)
		.where(and(eq(flashcardReview.id, reviewID), eq(flashcardReview.userID, userID)))
		.limit(1)
	if (!current) return null

	const schedule = calculateReviewSchedule({
		easeFactor: current.easeFactor,
		intervalDays: current.intervalDays,
		repetition: current.repetition,
	}, rating)
	const nextReviewAt = new Date(now.getTime() + schedule.intervalDays * DAY_MS)
	await database.batch([
		database.update(flashcardReview).set({
			...schedule,
			lastReviewedAt: now,
			nextReviewAt,
			reviewCount: current.reviewCount + 1,
			updatedAt: now,
		}).where(and(eq(flashcardReview.id, reviewID), eq(flashcardReview.userID, userID))),
		// This insert is the durable history. Later schedule updates never replace it.
		database.insert(flashcardReviewEvent).values({
			id: crypto.randomUUID(),
			userID,
			boardID: current.boardID,
			reviewID,
			rating,
			intervalDays: schedule.intervalDays,
			easeFactor: schedule.easeFactor,
			reviewedAt: now,
		}),
	])

	return { nextReviewAt: nextReviewAt.toISOString(), ...schedule }
}

/**
 * Builds the signed-in student's current session and seven-day review trend.
 * Review events are immutable inputs, so later schedule changes do not alter
 * the trend. Archived boards do not add cards or patterns to the session.
 */
export async function getStudyTodayDashboard(
	database: Database,
	userID: string,
	now = new Date()
): Promise<StudyTodayDashboard> {
	const trendStart = startOfUTCDay(new Date(now.getTime() - 6 * DAY_MS))
	const [answerAttempts, dueReviews, events, exams, mistakeRows] = await Promise.all([
		listRecentFlashcardAnswerAttempts(database, userID),
		listDueFlashcards(database, userID, now),
		database.select({
			rating: flashcardReviewEvent.rating,
			reviewedAt: flashcardReviewEvent.reviewedAt,
		}).from(flashcardReviewEvent)
			.innerJoin(board, eq(board.id, flashcardReviewEvent.boardID))
			.where(and(
				eq(flashcardReviewEvent.userID, userID),
				gte(flashcardReviewEvent.reviewedAt, trendStart),
				isNull(board.archivedAt)
			))
			.orderBy(flashcardReviewEvent.reviewedAt),
		listExamPlans(database, userID, now),
		database.select({
			boardID: studyMistake.boardID,
			concept: studyMistake.concept,
			createdAt: studyMistake.createdAt,
			description: studyMistake.description,
			patternKey: studyMistake.patternKey,
			title: studyMistake.title,
		}).from(studyMistake)
			.innerJoin(board, eq(board.id, studyMistake.boardID))
			.where(and(
				eq(studyMistake.userID, userID),
				eq(studyMistake.kind, 'learning-pattern'),
				isNull(board.archivedAt)
			))
			.orderBy(desc(studyMistake.createdAt))
			.limit(200),
	])

	return {
		answerAttempts,
		dueReviews,
		exams,
		patterns: groupStudyPatterns(mistakeRows).slice(0, 5),
		streakDays: calculateReviewStreak(events.map(({ reviewedAt }) => reviewedAt), now),
		trend: buildReviewTrend(events, now),
	}
}

function toFlashcardAnswerAttempt(
	value: typeof flashcardAnswerAttempt.$inferSelect,
	boardTitle: string
): FlashcardAnswerAttempt {
	return {
		alternateAnswers: value.alternateAnswers,
		boardID: value.boardID,
		boardTitle,
		completedAt: value.completedAt?.toISOString() ?? null,
		createdAt: value.createdAt.toISOString(),
		feedback: value.feedback,
		finalVerdict: value.finalVerdict,
		front: value.front,
		gradingMethod: value.gradingMethod,
		id: value.id,
		matchedAnswer: value.matchedAnswer,
		model: value.model,
		originalVerdict: value.originalVerdict,
		primaryAnswer: value.primaryAnswer,
		rating: value.rating,
		reviewID: value.reviewID,
		shapeID: value.shapeID,
		submittedAnswer: value.submittedAnswer,
	}
}

export function buildReviewTrend(
	events: ReadonlyArray<{ rating: FlashcardReviewRating; reviewedAt: Date }>,
	now = new Date()
): StudyTodayTrendDay[] {
	const totals = new Map<string, { remembered: number; reviewed: number }>()
	for (const event of events) {
		const day = toUTCDateKey(event.reviewedAt)
		const total = totals.get(day) ?? { remembered: 0, reviewed: 0 }
		total.reviewed += 1
		if (event.rating === 'good' || event.rating === 'easy') total.remembered += 1
		totals.set(day, total)
	}
	return Array.from({ length: 7 }, (_, index) => {
		const day = toUTCDateKey(new Date(now.getTime() - (6 - index) * DAY_MS))
		return { day, ...(totals.get(day) ?? { remembered: 0, reviewed: 0 }) }
	})
}

export function calculateReviewStreak(reviewDates: readonly Date[], now = new Date()) {
	const reviewedDays = new Set(reviewDates.map(toUTCDateKey))
	let cursor = startOfUTCDay(now)
	if (!reviewedDays.has(toUTCDateKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS)
	let streak = 0
	while (reviewedDays.has(toUTCDateKey(cursor))) {
		streak += 1
		cursor = new Date(cursor.getTime() - DAY_MS)
	}
	return streak
}

function groupStudyPatterns(rows: ReadonlyArray<{
	boardID: string | null
	concept: string
	createdAt: Date
	description: string
	patternKey: string
	title: string
}>): StudyTodayPattern[] {
	const patterns = new Map<string, StudyTodayPattern>()
	for (const row of rows) {
		if (!row.boardID) continue
		const current = patterns.get(row.patternKey)
		if (current) {
			current.count += 1
			continue
		}
		patterns.set(row.patternKey, {
			boardID: row.boardID,
			concept: row.concept,
			count: 1,
			description: row.description,
			lastSeenAt: row.createdAt.toISOString(),
			patternKey: row.patternKey,
			title: row.title,
		})
	}
	return [...patterns.values()].sort((left, right) =>
		right.count - left.count || right.lastSeenAt.localeCompare(left.lastSeenAt)
	)
}

function startOfUTCDay(value: Date) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function toUTCDateKey(value: Date) {
	return value.toISOString().slice(0, 10)
}

export function calculateReviewSchedule(
	current: { easeFactor: number; intervalDays: number; repetition: number },
	rating: FlashcardReviewRating
) {
	if (rating === 'again') {
		return {
			easeFactor: Math.max(1.3, current.easeFactor - 0.2),
			intervalDays: 1,
			repetition: 0,
		}
	}
	if (rating === 'hard') {
		return {
			easeFactor: Math.max(1.3, current.easeFactor - 0.15),
			intervalDays: Math.max(2, Math.round(Math.max(1, current.intervalDays) * 1.2)),
			repetition: current.repetition + 1,
		}
	}
	if (rating === 'easy') {
		return {
			easeFactor: Math.min(3, current.easeFactor + 0.15),
			intervalDays: current.repetition === 0
				? 4
				: Math.max(4, Math.round(Math.max(1, current.intervalDays) * current.easeFactor * 1.3)),
			repetition: current.repetition + 1,
		}
	}
	return {
		easeFactor: current.easeFactor,
		intervalDays: current.repetition === 0
			? 1
			: current.repetition === 1
				? 6
				: Math.max(1, Math.round(current.intervalDays * current.easeFactor)),
		repetition: current.repetition + 1,
	}
}

export async function recordStudyMistake(
	database: Database,
	userID: string,
	boardID: string,
	proposal: MistakeProposal,
	now = new Date()
): Promise<StudyMistake> {
	const value = {
		id: crypto.randomUUID(),
		userID,
		boardID,
		concept: proposal.concept,
		title: proposal.title,
		description: proposal.description,
		kind: 'learning-pattern' as const,
		patternKey: proposal.patternKey,
		shapeIDs: JSON.stringify(proposal.shapeIDs),
		createdAt: now,
	}
	await database.insert(studyMistake).values(value)
	return toStudyMistake(value)
}

/**
 * Saves one approved user memory with the board that supplied its source context.
 * A stable memory key lets later saves update the agent's effective view without
 * deleting the earlier approval record.
 */
export async function recordAgentMemory(
	database: Database,
	userID: string,
	boardID: string | null,
	proposal: AgentMemoryProposal,
	now = new Date()
) {
	await database.insert(studyMistake).values({
		id: crypto.randomUUID(),
		userID,
		boardID,
		concept: proposal.topic,
		title: proposal.title,
		description: proposal.content,
		kind: proposal.kind,
		patternKey: proposal.memoryKey,
		shapeIDs: '[]',
		createdAt: now,
	})
}

export async function listAgentMemories(
	database: Database,
	userID: string
): Promise<AgentMemory[]> {
	const rows = await database.select().from(studyMistake)
		.where(eq(studyMistake.userID, userID))
		.orderBy(desc(studyMistake.createdAt))
		.limit(200)
	const memories = new Map<string, AgentMemory>()
	for (const row of rows) {
		const current = memories.get(row.patternKey)
		if (current) {
			current.count += 1
			continue
		}
		memories.set(row.patternKey, {
			content: row.description,
			count: 1,
			kind: row.kind,
			lastSavedAt: row.createdAt.toISOString(),
			memoryKey: row.patternKey,
			title: row.title,
			topic: row.concept,
		})
	}
	return [...memories.values()].sort((a, b) =>
		b.lastSavedAt.localeCompare(a.lastSavedAt)
	)
}

export async function removeAgentMemory(
	database: Database,
	userID: string,
	memoryKey: string
) {
	const removed = await database.delete(studyMistake)
		.where(and(
			eq(studyMistake.userID, userID),
			eq(studyMistake.patternKey, memoryKey)
		))
		.returning({ id: studyMistake.id })
	return removed.length
}

export async function listBoardMistakes(
	database: Database,
	userID: string,
	boardID: string
): Promise<StudyMistake[]> {
	const rows = await database.select().from(studyMistake)
		.where(and(eq(studyMistake.userID, userID), eq(studyMistake.boardID, boardID)))
		.orderBy(desc(studyMistake.createdAt))
		.limit(100)
	return rows.map(toStudyMistake)
}

function toStudyMistake(value: typeof studyMistake.$inferSelect): StudyMistake {
	if (!value.boardID) throw new Error('Study mistake is missing its source space')
	return {
		boardID: value.boardID,
		concept: value.concept,
		createdAt: value.createdAt.toISOString(),
		description: value.description,
		id: value.id,
		patternKey: value.patternKey,
		shapeIDs: parseShapeIDs(value.shapeIDs),
		title: value.title,
	}
}

function parseShapeIDs(value: string) {
	try {
		const parsed: unknown = JSON.parse(value)
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
	} catch {
		return []
	}
}
