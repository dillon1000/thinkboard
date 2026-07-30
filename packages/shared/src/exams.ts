import { z } from 'zod'
import type { PracticeSetProposal } from './studyShapes'

export const studyArtifactKindSchema = z.enum([
	'concept-map',
	'equation',
	'flashcard',
	'note',
	'practice-problem',
	'quiz',
	'review-note',
	'teach-back',
	'walkthrough',
])

export const quizArtifactPayloadSchema = z.object({
	correctIndex: z.number().int().min(0).max(4),
	explanation: z.string().trim().min(1).max(600),
	options: z.array(z.string().trim().min(1).max(240)).min(2).max(5),
	question: z.string().trim().min(1).max(400),
}).refine((value) => value.correctIndex < value.options.length, {
	message: 'The correct answer must reference an available option',
	path: ['correctIndex'],
})

export const studyArtifactInputSchema = z.object({
	kind: studyArtifactKindSchema,
	payload: z.unknown().optional(),
	shapeID: z.string().trim().min(1).max(120),
	text: z.string().trim().min(1).max(8_000),
	title: z.string().trim().min(1).max(160),
})

export const registerStudyArtifactsSchema = z.object({
	artifacts: z.array(studyArtifactInputSchema).max(100),
	replaceKinds: z.array(studyArtifactKindSchema).max(12).optional(),
})

export const examPlanInputSchema = z.object({
	boardIDs: z.array(z.string().uuid()).min(1).max(12),
	documentIDs: z.array(z.string().uuid()).max(36).default([]),
	examDate: z.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Use a valid exam date'),
	primaryBoardID: z.string().uuid(),
	title: z.string().trim().min(1).max(120),
}).superRefine((value, context) => {
	if (!value.boardIDs.includes(value.primaryBoardID)) {
		context.addIssue({
			code: 'custom',
			message: 'The practice-exam space must be selected',
			path: ['primaryBoardID'],
		})
	}
})

export interface ExamDeckStatus {
	boardID: string
	boardTitle: string
	dueCards: number
	totalCards: number
}

export interface ExamPattern {
	boardID: string
	concept: string
	count: number
	description: string
	patternKey: string
	title: string
}

export interface ExamStudyTask {
	boardID: string | null
	date: string
	kind: 'mistake' | 'practice' | 'review'
	label: string
}

export interface ExamPlan {
	boardIDs: string[]
	createdAt: string
	decks: ExamDeckStatus[]
	documentIDs: string[]
	examDate: string
	id: string
	patterns: ExamPattern[]
	practiceReady: boolean
	primaryBoardID: string
	tasks: ExamStudyTask[]
	title: string
	updatedAt: string
}

export interface StudyArtifactInput {
	kind: StudyArtifactKind
	payload?: unknown
	shapeID: string
	text: string
	title: string
}

export interface ExamPracticeSet {
	boardID: string
	proposal: PracticeSetProposal
}

export type ExamPlanInput = z.infer<typeof examPlanInputSchema>
export type StudyArtifactKind = z.infer<typeof studyArtifactKindSchema>
