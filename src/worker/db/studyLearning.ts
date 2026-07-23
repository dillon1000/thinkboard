import type {
	DueFlashcard,
	FlashcardReviewRating,
	MistakePattern,
	MistakeProposal,
	StudyMistake,
} from '@agentboard/shared'
import { and, desc, eq, isNull, lte } from 'drizzle-orm'
import type { Database } from './client'
import { board, boardMember, flashcardReview, studyMistake } from './schema'

const DAY_MS = 86_400_000

interface FlashcardRegistration {
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
			nextReviewAt: now,
			createdAt: now,
			updatedAt: now,
		}).onConflictDoUpdate({
			target: [flashcardReview.userID, flashcardReview.boardID, flashcardReview.shapeID],
			set: { front: card.front, back: card.back, updatedAt: now },
		})
	}
}

export async function listDueFlashcards(
	database: Database,
	userID: string,
	now = new Date()
): Promise<DueFlashcard[]> {
	const rows = await database.select({
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
	await database.update(flashcardReview).set({
		...schedule,
		lastReviewedAt: now,
		nextReviewAt,
		reviewCount: current.reviewCount + 1,
		updatedAt: now,
	}).where(and(eq(flashcardReview.id, reviewID), eq(flashcardReview.userID, userID)))

	return { nextReviewAt: nextReviewAt.toISOString(), ...schedule }
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
		patternKey: proposal.patternKey,
		shapeIDs: JSON.stringify(proposal.shapeIDs),
		createdAt: now,
	}
	await database.insert(studyMistake).values(value)
	return toStudyMistake(value)
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

export async function listMistakePatterns(
	database: Database,
	userID: string
): Promise<MistakePattern[]> {
	const rows = await database.select().from(studyMistake)
		.where(eq(studyMistake.userID, userID))
		.orderBy(desc(studyMistake.createdAt))
		.limit(200)
	const patterns = new Map<string, MistakePattern>()
	for (const row of rows) {
		const current = patterns.get(row.patternKey)
		if (current) {
			current.count += 1
			continue
		}
		patterns.set(row.patternKey, {
			concept: row.concept,
			count: 1,
			description: row.description,
			lastSeenAt: row.createdAt.toISOString(),
			patternKey: row.patternKey,
			title: row.title,
		})
	}
	return [...patterns.values()].sort((a, b) => b.count - a.count).slice(0, 12)
}

function toStudyMistake(value: typeof studyMistake.$inferSelect): StudyMistake {
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
