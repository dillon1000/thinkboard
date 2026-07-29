import { z } from 'zod'

export const studyModelModeSchema = z.enum(['quicker', 'smarter'])
export type StudyModelMode = z.infer<typeof studyModelModeSchema>

export const STUDY_REASONING_EFFORTS = ['low', 'medium', 'high'] as const
export const studyReasoningEffortSchema = z.enum(STUDY_REASONING_EFFORTS)
export type StudyReasoningEffort = z.infer<typeof studyReasoningEffortSchema>

export const STUDY_MODELS = {
	quicker: {
		id: 'openai/gpt-5.6-luna',
		label: 'Quicker',
		description: 'Fast reasoning for everyday study questions.',
		contextWindowTokens: 1_050_000,
		supportsReasoning: true,
		openRouterProvider: undefined,
	},
	smarter: {
		id: 'x-ai/grok-4.5',
		label: 'Smarter',
		description: 'Deep reasoning for difficult, multi-step problems.',
		contextWindowTokens: 500_000,
		supportsReasoning: true,
		openRouterProvider: undefined,
	},
} as const satisfies Record<StudyModelMode, {
	id: string
	label: string
	description: string
	contextWindowTokens: number
	supportsReasoning: boolean
	openRouterProvider: string | undefined
}>

export const DEFAULT_STUDY_MODEL_MODE = 'quicker' satisfies StudyModelMode
export const DEFAULT_STUDY_MODEL = STUDY_MODELS[DEFAULT_STUDY_MODEL_MODE].id
export const DEFAULT_STUDY_REASONING_EFFORT = 'medium' satisfies StudyReasoningEffort
export const STUDY_CONTEXT_WINDOW_TOKENS = STUDY_MODELS[DEFAULT_STUDY_MODEL_MODE].contextWindowTokens

export function getStudyModel(mode: StudyModelMode) {
	return STUDY_MODELS[mode]
}

export function studyModelSupportsReasoning(mode: StudyModelMode) {
	return STUDY_MODELS[mode].supportsReasoning
}

/** A compact summary of the canvas/PDF context a student attached to one message, shown as a chip. */
export interface StudyMessageContextChip {
	kind: 'shapes' | 'pdf' | 'document' | 'image'
	label: string
	meta?: string
}

export interface StudyMessageMetadata {
	contextTokens?: number
	contextWindowTokens?: number
	model?: string
	modelMode?: StudyModelMode
	reasoningEffort?: StudyReasoningEffort
	contextChips?: StudyMessageContextChip[]
}
