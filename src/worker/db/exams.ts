import {
	practiceSetProposalSchema,
	quizArtifactPayloadSchema,
	type ExamPattern,
	type ExamPlan,
	type ExamPlanInput,
	type ExamStudyTask,
	type PracticeSetProposal,
	type StudyArtifactInput,
} from '@agentboard/shared'
import { and, asc, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from './client'
import {
	board,
	boardMember,
	document,
	documentPage,
	examPlan,
	flashcardReview,
	studyArtifact,
	studyMistake,
} from './schema'

const DAY_MS = 86_400_000

export async function registerStudyArtifacts(
	database: Database,
	boardID: string,
	artifacts: readonly StudyArtifactInput[],
	now = new Date()
) {
	for (const artifact of artifacts) {
		await database
			.insert(studyArtifact)
			.values({
				boardID,
				shapeID: artifact.shapeID,
				kind: artifact.kind,
				title: artifact.title,
				text: artifact.text,
				payload: JSON.stringify(artifact.payload ?? null),
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [studyArtifact.boardID, studyArtifact.shapeID],
				set: {
					kind: artifact.kind,
					title: artifact.title,
					text: artifact.text,
					payload: JSON.stringify(artifact.payload ?? null),
					updatedAt: now,
				},
			})
	}
}

export async function removeStudyArtifact(
	database: Database,
	boardID: string,
	shapeID: string
) {
	await database
		.delete(studyArtifact)
		.where(and(eq(studyArtifact.boardID, boardID), eq(studyArtifact.shapeID, shapeID)))
}

/**
 * Replaces the indexed artifact kinds with one canvas snapshot. It returns removed shape IDs so
 * the vector index can delete stale entries after the D1 change succeeds.
 */
export async function replaceStudyArtifacts(
	database: Database,
	boardID: string,
	artifacts: readonly StudyArtifactInput[],
	replaceKinds: readonly StudyArtifactInput['kind'][]
) {
	const kinds = [...new Set(replaceKinds)]
	if (!kinds.length) {
		await registerStudyArtifacts(database, boardID, artifacts)
		return []
	}
	const keptShapeIDs = artifacts
		.filter(({ kind }) => kinds.includes(kind))
		.map(({ shapeID }) => shapeID)
	const scope = and(
		eq(studyArtifact.boardID, boardID),
		inArray(studyArtifact.kind, kinds)
	)
	const removed = await database
		.delete(studyArtifact)
		.where(keptShapeIDs.length ? and(scope, notInArray(studyArtifact.shapeID, keptShapeIDs)) : scope)
		.returning({ shapeID: studyArtifact.shapeID })
	await registerStudyArtifacts(database, boardID, artifacts)
	return removed.map(({ shapeID }) => shapeID)
}

/**
 * Creates a private exam plan after confirming that every selected space and document is available
 * to the student. The stored selection is immutable; later summaries use live review and mistake
 * data so Today stays current.
 */
export async function createExamPlan(
	database: Database,
	userID: string,
	input: ExamPlanInput,
	now = new Date()
): Promise<ExamPlan | null> {
	const boardIDs = [...new Set(input.boardIDs)]
	const documentIDs = [...new Set(input.documentIDs)]
	const accessRows = await database
		.select({ boardID: boardMember.boardID })
		.from(boardMember)
		.innerJoin(board, eq(board.id, boardMember.boardID))
		.where(and(
			eq(boardMember.userID, userID),
			inArray(boardMember.boardID, boardIDs),
			isNull(board.archivedAt)
		))
	if (new Set(accessRows.map(({ boardID }) => boardID)).size !== boardIDs.length) return null
	if (documentIDs.length) {
		const documentRows = await database
			.select({ id: document.id })
			.from(document)
			.where(and(inArray(document.id, documentIDs), inArray(document.boardID, boardIDs)))
		if (new Set(documentRows.map(({ id }) => id)).size !== documentIDs.length) return null
	}

	const id = crypto.randomUUID()
	await database.insert(examPlan).values({
		id,
		userID,
		title: input.title,
		examDate: input.examDate,
		boardIDs,
		documentIDs,
		primaryBoardID: input.primaryBoardID,
		createdAt: now,
		updatedAt: now,
	})
	return getExamPlan(database, userID, id, now)
}

export async function listExamPlans(
	database: Database,
	userID: string,
	now = new Date()
): Promise<ExamPlan[]> {
	const rows = await database
		.select()
		.from(examPlan)
		.where(eq(examPlan.userID, userID))
		.orderBy(asc(examPlan.examDate))
	return Promise.all(rows.map((row) => summarizeExamPlan(database, row, now)))
}

export async function getExamPlan(
	database: Database,
	userID: string,
	examID: string,
	now = new Date()
): Promise<ExamPlan | null> {
	const [row] = await database
		.select()
		.from(examPlan)
		.where(and(eq(examPlan.id, examID), eq(examPlan.userID, userID)))
		.limit(1)
	return row ? summarizeExamPlan(database, row, now) : null
}

export async function removeExamPlan(
	database: Database,
	userID: string,
	examID: string
) {
	const rows = await database
		.delete(examPlan)
		.where(and(eq(examPlan.id, examID), eq(examPlan.userID, userID)))
		.returning({ id: examPlan.id })
	return rows.length > 0
}

export async function getExamPracticeSources(
	database: Database,
	userID: string,
	examID: string
) {
	const [plan] = await database
		.select()
		.from(examPlan)
		.where(and(eq(examPlan.id, examID), eq(examPlan.userID, userID)))
		.limit(1)
	if (!plan) return null
	const [artifacts, cards, pages] = await Promise.all([
		database
			.select({
				kind: studyArtifact.kind,
				payload: studyArtifact.payload,
				text: studyArtifact.text,
				title: studyArtifact.title,
			})
			.from(studyArtifact)
			.where(and(
				inArray(studyArtifact.boardID, plan.boardIDs),
				inArray(studyArtifact.kind, ['quiz', 'practice-problem'])
			))
			.orderBy(desc(studyArtifact.updatedAt))
			.limit(30),
		database
			.select({
				back: flashcardReview.back,
				front: flashcardReview.front,
			})
			.from(flashcardReview)
			.where(and(
				eq(flashcardReview.userID, userID),
				inArray(flashcardReview.boardID, plan.boardIDs)
			))
			.orderBy(asc(flashcardReview.nextReviewAt))
			.limit(30),
		plan.documentIDs.length
			? database
				.select({
					documentTitle: document.title,
					pageNumber: documentPage.pageNumber,
					text: documentPage.extractedText,
				})
				.from(documentPage)
				.innerJoin(document, eq(document.id, documentPage.documentID))
				.where(and(
					inArray(document.id, plan.documentIDs),
					eq(document.status, 'ready')
				))
				.orderBy(asc(documentPage.pageNumber))
				.limit(40)
			: Promise.resolve([]),
	])
	const storedPracticeSet = parsePracticeSet(plan.practiceSet)
	return {
		artifacts,
		cards,
		pages,
		plan,
		storedPracticeSet,
	}
}

export async function saveExamPracticeSet(
	database: Database,
	userID: string,
	examID: string,
	proposal: PracticeSetProposal,
	now = new Date()
) {
	await database
		.update(examPlan)
		.set({ practiceSet: JSON.stringify(proposal), updatedAt: now })
		.where(and(eq(examPlan.id, examID), eq(examPlan.userID, userID)))
}

export function parseQuizArtifacts(
	artifacts: ReadonlyArray<{ payload: string }>
) {
	return artifacts.flatMap(({ payload }) => {
		const parsed = parseJSON(payload)
		const quiz = quizArtifactPayloadSchema.safeParse(parsed)
		return quiz.success ? [quiz.data] : []
	})
}

function parsePracticeSet(value: string | null) {
	const parsed = value ? parseJSON(value) : null
	const result = practiceSetProposalSchema.safeParse(parsed)
	return result.success ? result.data : null
}

async function summarizeExamPlan(
	database: Database,
	row: typeof examPlan.$inferSelect,
	now: Date
): Promise<ExamPlan> {
	const [boardRows, reviews, mistakeRows] = await Promise.all([
		database
			.select({ id: board.id, title: board.title })
			.from(board)
			.where(and(inArray(board.id, row.boardIDs), isNull(board.archivedAt))),
		database
			.select({
				boardID: flashcardReview.boardID,
				nextReviewAt: flashcardReview.nextReviewAt,
			})
			.from(flashcardReview)
			.where(and(
				eq(flashcardReview.userID, row.userID),
				inArray(flashcardReview.boardID, row.boardIDs)
			)),
		database
			.select({
				boardID: studyMistake.boardID,
				concept: studyMistake.concept,
				createdAt: studyMistake.createdAt,
				description: studyMistake.description,
				patternKey: studyMistake.patternKey,
				title: studyMistake.title,
			})
			.from(studyMistake)
			.where(and(
				eq(studyMistake.userID, row.userID),
				eq(studyMistake.kind, 'learning-pattern'),
				inArray(studyMistake.boardID, row.boardIDs)
			))
			.orderBy(desc(studyMistake.createdAt))
			.limit(300),
	])
	const decks = boardRows.map((boardRow) => {
		const boardReviews = reviews.filter(({ boardID }) => boardID === boardRow.id)
		return {
			boardID: boardRow.id,
			boardTitle: boardRow.title,
			dueCards: boardReviews.filter(({ nextReviewAt }) => nextReviewAt <= now).length,
			totalCards: boardReviews.length,
		}
	}).sort((left, right) => right.dueCards - left.dueCards)
	const patterns = groupExamPatterns(mistakeRows).slice(0, 8)
	return {
		boardIDs: row.boardIDs,
		createdAt: row.createdAt.toISOString(),
		decks,
		documentIDs: row.documentIDs,
		examDate: row.examDate,
		id: row.id,
		patterns,
		practiceReady: Boolean(row.practiceSet),
		primaryBoardID: row.primaryBoardID,
		tasks: buildExamTasks(row.examDate, decks, patterns, now),
		title: row.title,
		updatedAt: row.updatedAt.toISOString(),
	}
}

function groupExamPatterns(rows: ReadonlyArray<{
	boardID: string | null
	concept: string
	createdAt: Date
	description: string
	patternKey: string
	title: string
}>): ExamPattern[] {
	const patterns = new Map<string, ExamPattern>()
	for (const row of rows) {
		if (!row.boardID) continue
		const existing = patterns.get(row.patternKey)
		if (existing) {
			existing.count += 1
			continue
		}
		patterns.set(row.patternKey, {
			boardID: row.boardID,
			concept: row.concept,
			count: 1,
			description: row.description,
			patternKey: row.patternKey,
			title: row.title,
		})
	}
	return [...patterns.values()].sort((left, right) => right.count - left.count)
}

export function buildExamTasks(
	examDate: string,
	decks: ExamPlan['decks'],
	patterns: ExamPattern[],
	now = new Date()
): ExamStudyTask[] {
	const today = startOfUTCDay(now)
	const exam = new Date(`${examDate}T00:00:00Z`)
	const daysRemaining = Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / DAY_MS))
	const dayCount = Math.min(30, Math.max(1, daysRemaining))
	const dueDecks = decks.filter(({ dueCards }) => dueCards > 0)
	return Array.from({ length: dayCount }, (_, index) => {
		const date = new Date(today.getTime() + index * DAY_MS).toISOString().slice(0, 10)
		const deck = dueDecks[index % Math.max(1, dueDecks.length)] ?? decks[index % Math.max(1, decks.length)]
		const pattern = patterns[index % Math.max(1, patterns.length)]
		if (index % 3 === 0 && deck) {
			return {
				boardID: deck.boardID,
				date,
				kind: 'review' as const,
				label: deck.dueCards
					? `Review ${deck.dueCards} due cards in ${deck.boardTitle}`
					: `Review the ${deck.boardTitle} deck`,
			}
		}
		if (index % 3 === 1 && pattern) {
			return {
				boardID: pattern.boardID,
				date,
				kind: 'mistake' as const,
				label: `Rework the “${pattern.title}” mistake pattern`,
			}
		}
		return {
			boardID: deck?.boardID ?? null,
			date,
			kind: 'practice' as const,
			label: index === dayCount - 1
				? 'Take the assembled practice exam'
				: 'Complete one timed practice block',
		}
	})
}

function startOfUTCDay(value: Date) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function parseJSON(value: string): z.infer<ReturnType<typeof z.json>> | null {
	try {
		return z.json().parse(JSON.parse(value))
	} catch {
		return null
	}
}
