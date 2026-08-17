import { z } from 'zod'
import { practiceSetProposalSchema } from './studyShapes'

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
	payload: z.json().optional(),
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

export const examDeckStatusSchema = z.object({
	boardID: z.string(),
	boardTitle: z.string(),
	dueCards: z.number().int().nonnegative(),
	totalCards: z.number().int().nonnegative(),
})

export const examPatternSchema = z.object({
	boardID: z.string(),
	concept: z.string(),
	count: z.number().int().nonnegative(),
	description: z.string(),
	patternKey: z.string(),
	title: z.string(),
})

export const examStudyTaskSchema = z.object({
	boardID: z.string().nullable(),
	date: z.string(),
	kind: z.enum(['mistake', 'practice', 'review']),
	label: z.string(),
})

export const examPlanSchema = z.object({
	boardIDs: z.array(z.string()),
	createdAt: z.string(),
	decks: z.array(examDeckStatusSchema),
	documentIDs: z.array(z.string()),
	examDate: z.string(),
	id: z.string(),
	patterns: z.array(examPatternSchema),
	practiceReady: z.boolean(),
	primaryBoardID: z.string(),
	tasks: z.array(examStudyTaskSchema),
	title: z.string(),
	updatedAt: z.string(),
})

export const examPracticeSetSchema = z.object({
	boardID: z.string(),
	proposal: practiceSetProposalSchema,
})

export type ExamPlanInput = z.infer<typeof examPlanInputSchema>
export type ExamDeckStatus = z.infer<typeof examDeckStatusSchema>
export type ExamPattern = z.infer<typeof examPatternSchema>
export type ExamStudyTask = z.infer<typeof examStudyTaskSchema>
export type ExamPlan = z.infer<typeof examPlanSchema>
export type ExamPracticeSet = z.infer<typeof examPracticeSetSchema>
export type StudyArtifactInput = z.infer<typeof studyArtifactInputSchema>
export type StudyArtifactKind = z.infer<typeof studyArtifactKindSchema>
