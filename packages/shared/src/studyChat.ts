import { z } from 'zod'

export const studyModelModeSchema = z.enum(['quicker', 'smarter'])
export type StudyModelMode = z.infer<typeof studyModelModeSchema>

export const STUDY_MODELS = {
	quicker: {
		id: '@cf/meta/llama-4-scout-17b-16e-instruct',
		label: 'Quicker',
		description: 'Fast explanations for everyday study questions.',
		contextWindowTokens: 131_000,
		supportsReasoning: false,
	},
	smarter: {
		id: '@cf/moonshotai/kimi-k2.6',
		label: 'Smarter',
		description: 'Deep reasoning for difficult, multi-step problems.',
		contextWindowTokens: 262_144,
		supportsReasoning: true,
	},
} as const satisfies Record<StudyModelMode, {
	id: string
	label: string
	description: string
	contextWindowTokens: number
	supportsReasoning: boolean
}>

export const DEFAULT_STUDY_MODEL_MODE = 'quicker' satisfies StudyModelMode
export const DEFAULT_STUDY_MODEL = STUDY_MODELS[DEFAULT_STUDY_MODEL_MODE].id
export const STUDY_CONTEXT_WINDOW_TOKENS = STUDY_MODELS[DEFAULT_STUDY_MODEL_MODE].contextWindowTokens

export function getStudyModel(mode: StudyModelMode) {
	return STUDY_MODELS[mode]
}

export function studyModelSupportsReasoning(mode: StudyModelMode) {
	return STUDY_MODELS[mode].supportsReasoning
}

export interface StudyMessageMetadata {
	contextTokens?: number
	contextWindowTokens?: number
	model?: string
	modelMode?: StudyModelMode
}
