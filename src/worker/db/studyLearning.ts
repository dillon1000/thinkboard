import type {
	AgentMemory,
	AgentMemoryProposal,
	DueFlashcard,
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
	flashcardReview,
	flashcardReviewEvent,
	studyMistake,
} from './schema'

const DAY_MS = 86_400_000

interface FlashcardRegistration {
	alternateAnswers: string[]
	back: string
	front: string
	shapeID: string
}

export async function registerFlashcards(
	database: Database,
	userID: string,
	boardID: string,
	cards: readonly FlashcardRegistration[],
	now = new Date()
) {
	for (const card of cards) {
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
		}).onConflictDoUpdate({
			target: [flashcardReview.userID, flashcardReview.boardID, flashcardReview.shapeID],
			set: {
				alternateAnswers: card.alternateAnswers,
				front: card.front,
				back: card.back,
				updatedAt: now,
			},
		})
	}
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
	const [dueReviews, events, mistakeRows] = await Promise.all([
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
		answerAttempts: [],
		dueReviews,
		patterns: groupStudyPatterns(mistakeRows).slice(0, 5),
		streakDays: calculateReviewStreak(events.map(({ reviewedAt }) => reviewedAt), now),
		trend: buildReviewTrend(events, now),
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
	if (!value.boardID) throw new Error('Study mistake is missing its source board')
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
