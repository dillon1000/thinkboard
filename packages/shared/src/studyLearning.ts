import { z } from 'zod'

export const studyModeSchema = z.enum(['direct', 'socratic'])
export const flashcardReviewRatingSchema = z.enum(['again', 'hard', 'good', 'easy'])
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
	})).min(1).max(30),
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

export interface StudyTodayPattern {
	boardID: string
	concept: string
	count: number
	description: string
	lastSeenAt: string
	patternKey: string
	title: string
}

export interface StudyTodayTrendDay {
	day: string
	remembered: number
	reviewed: number
}

export interface StudyTodayDashboard {
	dueReviews: DueFlashcard[]
	patterns: StudyTodayPattern[]
	streakDays: number
	trend: StudyTodayTrendDay[]
}

export interface AgentMemory {
	content: string
	count: number
	kind: AgentMemoryKind
	lastSavedAt: string
	memoryKey: string
	title: string
	topic: string
}

export type AgentMemoryKind = z.infer<typeof agentMemoryKindSchema>
export type AgentMemoryProposal = z.infer<typeof agentMemoryProposalSchema>
export type AgentPersonality = z.infer<typeof agentPersonalitySchema>
export type AgentProfile = z.infer<typeof agentProfileSchema>
export type AgentPromptSources = z.infer<typeof agentPromptSourcesSchema>
export type FlashcardReviewRating = z.infer<typeof flashcardReviewRatingSchema>
export type ManualAgentMemory = z.infer<typeof manualAgentMemorySchema>
export type MistakeProposal = z.infer<typeof mistakeProposalSchema>
export type StudyMode = z.infer<typeof studyModeSchema>
