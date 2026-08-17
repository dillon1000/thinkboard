import { z } from 'zod'
import { examPlanSchema } from './exams'

export const studyModeSchema = z.enum(['direct', 'socratic'])
export const flashcardReviewRatingSchema = z.enum(['again', 'hard', 'good', 'easy'])
export const flashcardAnswerVerdictSchema = z.enum([
	'correct',
	'incorrect',
	'uncertain',
	'skipped',
])
export const flashcardFinalVerdictSchema = z.enum(['correct', 'incorrect', 'skipped'])
export const flashcardGradingMethodSchema = z.enum([
	'exact',
	'edit-distance',
	'word-coverage',
	'ai',
	'ai-unavailable',
	'skipped',
])
export const agentMemoryKindSchema = z.enum([
	'background',
	'goal',
	'learning-pattern',
	'preference',
])
export const agentPersonalitySchema = z.enum([
	'balanced',
	'encouraging',
	'precise',
	'challenging',
	'custom',
])
export const agentMemoryKeySchema = z.string()
	.trim()
	.min(1)
	.max(120)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const registerFlashcardsSchema = z.object({
	cards: z.array(z.object({
		shapeID: z.string().max(120),
		front: z.string().trim().min(1).max(300),
		back: z.string().trim().min(1).max(600),
		alternateAnswers: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
	})).min(1).max(30),
})

const flashcardAnswerSourceSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('review'),
		reviewID: z.string().trim().min(1).max(120),
	}),
	z.object({
		kind: z.literal('canvas'),
		boardID: z.string().trim().min(1).max(120),
		shapeID: z.string().trim().min(1).max(120),
		front: z.string().trim().min(1).max(300),
		back: z.string().trim().min(1).max(600),
		alternateAnswers: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
	}),
])

export const flashcardAnswerAttemptRequestSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('answer'),
		answer: z.string().trim().min(1).max(1_200),
		source: flashcardAnswerSourceSchema,
	}),
	z.object({
		action: z.literal('skip'),
		source: flashcardAnswerSourceSchema,
	}),
])

export const flashcardAnswerCompletionSchema = z.object({
	finalVerdict: flashcardFinalVerdictSchema,
	rating: flashcardReviewRatingSchema.optional(),
})

export const mistakeProposalSchema = z.object({
	concept: z.string().trim().min(1).max(100).describe('Academic concept or skill involved.'),
	title: z.string().trim().min(1).max(120).describe('Short, student-friendly name for the mistake.'),
	description: z.string().trim().min(1).max(800).describe('What went wrong and what to check next time.'),
	patternKey: agentMemoryKeySchema
		.describe('Stable lowercase kebab-case identifier for grouping repeated mistakes.'),
	shapeIDs: z.array(z.string().max(120)).max(30).default([]),
})

export const agentMemoryProposalSchema = z.object({
	content: z.string().trim().min(1).max(800)
		.describe('One concise fact to remember. Do not include sensitive personal data.'),
	kind: agentMemoryKindSchema.describe('Why this memory can improve future study help.'),
	memoryKey: agentMemoryKeySchema
		.describe('Stable lowercase kebab-case identifier. Reuse it when updating the same fact.'),
	title: z.string().trim().min(1).max(120).describe('Short label shown to the student.'),
	topic: z.string().trim().min(1).max(100).describe('Subject or area this memory applies to.'),
})

export const manualAgentMemorySchema = agentMemoryProposalSchema.omit({ memoryKey: true })

export const agentPromptSourcesSchema = z.object({
	aboutUser: z.boolean(),
	boardContext: z.boolean(),
	connectedServices: z.boolean(),
	customInstructions: z.boolean(),
	memories: z.boolean(),
})

export const agentProfileSchema = z.object({
	aboutUser: z.string().trim().max(2_000),
	customInstructions: z.string().trim().max(4_000),
	customPersonality: z.string().trim().max(1_000),
	personality: agentPersonalitySchema,
	promptSources: agentPromptSourcesSchema,
})

export const DEFAULT_AGENT_PROFILE: AgentProfile = {
	aboutUser: '',
	customInstructions: '',
	customPersonality: '',
	personality: 'balanced',
	promptSources: {
		aboutUser: true,
		boardContext: true,
		connectedServices: true,
		customInstructions: true,
		memories: true,
	},
}

export const dueFlashcardSchema = z.object({
	alternateAnswers: z.array(z.string()),
	back: z.string(),
	boardID: z.string(),
	boardTitle: z.string(),
	dueAt: z.string(),
	front: z.string(),
	reviewCount: z.number().int().nonnegative(),
	reviewID: z.string(),
	shapeID: z.string(),
})

export const flashcardAnswerAttemptSchema = z.object({
	alternateAnswers: z.array(z.string()),
	boardID: z.string(),
	boardTitle: z.string(),
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	feedback: z.string().nullable(),
	finalVerdict: flashcardFinalVerdictSchema.nullable(),
	front: z.string(),
	gradingMethod: flashcardGradingMethodSchema,
	id: z.string(),
	matchedAnswer: z.string().nullable(),
	model: z.string().nullable(),
	originalVerdict: flashcardAnswerVerdictSchema,
	primaryAnswer: z.string(),
	rating: flashcardReviewRatingSchema.nullable(),
	reviewID: z.string().nullable(),
	shapeID: z.string(),
	submittedAnswer: z.string().nullable(),
})

export const flashcardAnswerAttemptResultSchema = z.object({
	attempt: flashcardAnswerAttemptSchema,
	isDue: z.boolean(),
})

export const flashcardAnswerCompletionResultSchema = z.object({
	attempt: flashcardAnswerAttemptSchema,
	schedule: z.object({
		easeFactor: z.number(),
		intervalDays: z.number(),
		nextReviewAt: z.string(),
		repetition: z.number(),
	}).nullable(),
})

export const studyMistakeSchema = z.object({
	boardID: z.string(),
	concept: z.string(),
	createdAt: z.string(),
	description: z.string(),
	id: z.string(),
	patternKey: z.string(),
	shapeIDs: z.array(z.string()),
	title: z.string(),
})

export const studyTodayPatternSchema = z.object({
	boardID: z.string(),
	concept: z.string(),
	count: z.number().int().nonnegative(),
	description: z.string(),
	lastSeenAt: z.string(),
	patternKey: z.string(),
	title: z.string(),
})

export const studyTodayTrendDaySchema = z.object({
	day: z.string(),
	remembered: z.number().int().nonnegative(),
	reviewed: z.number().int().nonnegative(),
})

export const agentMemorySchema = z.object({
	content: z.string(),
	count: z.number().int().nonnegative(),
	kind: agentMemoryKindSchema,
	lastSavedAt: z.string(),
	memoryKey: z.string(),
	title: z.string(),
	topic: z.string(),
})

export const studyTodayDashboardSchema = z.object({
	answerAttempts: z.array(flashcardAnswerAttemptSchema),
	dueReviews: z.array(dueFlashcardSchema),
	exams: z.array(examPlanSchema),
	patterns: z.array(studyTodayPatternSchema),
	streakDays: z.number().int().nonnegative(),
	trend: z.array(studyTodayTrendDaySchema),
})

export type AgentMemoryKind = z.infer<typeof agentMemoryKindSchema>
export type AgentMemory = z.infer<typeof agentMemorySchema>
export type AgentMemoryProposal = z.infer<typeof agentMemoryProposalSchema>
export type AgentPersonality = z.infer<typeof agentPersonalitySchema>
export type AgentProfile = z.infer<typeof agentProfileSchema>
export type AgentPromptSources = z.infer<typeof agentPromptSourcesSchema>
export type FlashcardReviewRating = z.infer<typeof flashcardReviewRatingSchema>
export type FlashcardAnswerAttemptRequest = z.infer<typeof flashcardAnswerAttemptRequestSchema>
export type FlashcardAnswerCompletion = z.infer<typeof flashcardAnswerCompletionSchema>
export type FlashcardAnswerVerdict = z.infer<typeof flashcardAnswerVerdictSchema>
export type FlashcardFinalVerdict = z.infer<typeof flashcardFinalVerdictSchema>
export type FlashcardGradingMethod = z.infer<typeof flashcardGradingMethodSchema>
export type DueFlashcard = z.infer<typeof dueFlashcardSchema>
export type FlashcardAnswerAttempt = z.infer<typeof flashcardAnswerAttemptSchema>
export type FlashcardAnswerAttemptResult = z.infer<typeof flashcardAnswerAttemptResultSchema>
export type FlashcardAnswerCompletionResult = z.infer<typeof flashcardAnswerCompletionResultSchema>
export type ManualAgentMemory = z.infer<typeof manualAgentMemorySchema>
export type MistakeProposal = z.infer<typeof mistakeProposalSchema>
export type StudyMistake = z.infer<typeof studyMistakeSchema>
export type StudyMode = z.infer<typeof studyModeSchema>
export type StudyTodayDashboard = z.infer<typeof studyTodayDashboardSchema>
export type StudyTodayPattern = z.infer<typeof studyTodayPatternSchema>
export type StudyTodayTrendDay = z.infer<typeof studyTodayTrendDaySchema>
