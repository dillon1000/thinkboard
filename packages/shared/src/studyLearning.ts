import { z } from 'zod'

export const studyModeSchema = z.enum(['direct', 'socratic'])
export const flashcardReviewRatingSchema = z.enum(['again', 'hard', 'good', 'easy'])

export const registerFlashcardsSchema = z.object({
	cards: z.array(z.object({
		shapeID: z.string().max(120),
		front: z.string().trim().min(1).max(300),
		back: z.string().trim().min(1).max(600),
	})).min(1).max(30),
})

export const mistakeProposalSchema = z.object({
	concept: z.string().trim().min(1).max(100).describe('Academic concept or skill involved.'),
	title: z.string().trim().min(1).max(120).describe('Short, student-friendly name for the mistake.'),
	description: z.string().trim().min(1).max(800).describe('What went wrong and what to check next time.'),
	patternKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.describe('Stable lowercase kebab-case identifier for grouping repeated mistakes.'),
	shapeIDs: z.array(z.string().max(120)).max(30).default([]),
})

export interface DueFlashcard {
	back: string
	boardID: string
	boardTitle: string
	dueAt: string
	front: string
	reviewCount: number
	reviewID: string
	shapeID: string
}

export interface StudyMistake {
	boardID: string
	concept: string
	createdAt: string
	description: string
	id: string
	patternKey: string
	shapeIDs: string[]
	title: string
}

export interface MistakePattern {
	concept: string
	count: number
	description: string
	lastSeenAt: string
	patternKey: string
	title: string
}

export type FlashcardReviewRating = z.infer<typeof flashcardReviewRatingSchema>
export type MistakeProposal = z.infer<typeof mistakeProposalSchema>
export type StudyMode = z.infer<typeof studyModeSchema>
