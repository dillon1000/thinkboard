import { createShapePropsMigrationSequence } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { z } from 'zod'

export const FLASHCARD_SHAPE_TYPE = 'agentboard-flashcard' as const
export const CONCEPT_MAP_SHAPE_TYPE = 'agentboard-concept-map' as const
export const QUIZ_SHAPE_TYPE = 'agentboard-quiz' as const
export const REVIEW_SHAPE_TYPE = 'agentboard-review' as const
export const WALKTHROUGH_SHAPE_TYPE = 'agentboard-walkthrough' as const
export const PDF_PAGE_SHAPE_TYPE = 'pdf-page' as const

export interface FlashcardShapeProps {
	w: number
	h: number
	front: string
	back: string
	revealed: boolean
	schemaVersion: number
}

export interface QuizShapeProps {
	w: number
	h: number
	question: string
	options: string[]
	correctIndex: number
	explanation: string
	selectedIndex: number
	showResult: boolean
	schemaVersion: number
}

export interface ReviewShapeProps {
	w: number
	h: number
	title: string
	body: string
	severity: 'note' | 'check' | 'correction'
	resolved: boolean
	schemaVersion: number
}

export interface WalkthroughShapeProps {
	w: number
	h: number
	title: string
	steps: Array<{ prompt: string; explanation: string }>
	currentStep: number
	revealed: boolean
	schemaVersion: number
}

export interface ConceptMapShapeProps {
	w: number
	h: number
	title: string
	nodes: Array<{ id: string; label: string; x: number; y: number }>
	edges: Array<{ from: string; to: string; label: string }>
	schemaVersion: number
}

export interface PDFPageShapeProps {
	documentId: string
	pageNumber: number
	renderVersion: number
	w: number
	h: number
}

export const flashcardShapeProps = {
	w: T.number,
	h: T.number,
	front: T.string,
	back: T.string,
	revealed: T.boolean,
	schemaVersion: T.positiveInteger,
}

export const quizShapeProps = {
	w: T.number,
	h: T.number,
	question: T.string,
	options: T.arrayOf(T.string),
	correctIndex: T.number,
	explanation: T.string,
	selectedIndex: T.number,
	showResult: T.boolean,
	schemaVersion: T.positiveInteger,
}

export const reviewShapeProps = {
	w: T.number,
	h: T.number,
	title: T.string,
	body: T.string,
	severity: T.literalEnum('note', 'check', 'correction'),
	resolved: T.boolean,
	schemaVersion: T.positiveInteger,
}

export const walkthroughShapeProps = {
	w: T.number,
	h: T.number,
	title: T.string,
	steps: T.arrayOf(T.object({ prompt: T.string, explanation: T.string })),
	currentStep: T.number,
	revealed: T.boolean,
	schemaVersion: T.positiveInteger,
}

export const conceptMapShapeProps = {
	w: T.number,
	h: T.number,
	title: T.string,
	nodes: T.arrayOf(T.object({ id: T.string, label: T.string, x: T.number, y: T.number })),
	edges: T.arrayOf(T.object({ from: T.string, to: T.string, label: T.string })),
	schemaVersion: T.positiveInteger,
}

export const pdfPageShapeProps = {
	documentId: T.string,
	pageNumber: T.positiveInteger,
	renderVersion: T.positiveInteger,
	w: T.number,
	h: T.number,
}

export const pdfPageShapeMigrations = createShapePropsMigrationSequence({
	sequence: [{
		id: 'com.tldraw.shape.pdf-page/1',
		up: (props) => {
			props.renderVersion = 1
		},
		down: (props) => {
			delete props.renderVersion
		},
	}],
})

export const flashcardShapeValidator = T.object(flashcardShapeProps)
export const quizShapeValidator = T.object(quizShapeProps)
export const reviewShapeValidator = T.object(reviewShapeProps)
export const walkthroughShapeValidator = T.object(walkthroughShapeProps)
export const conceptMapShapeValidator = T.object(conceptMapShapeProps)
export const pdfPageShapeValidator = T.object(pdfPageShapeProps)

export const studyShapeSchemas = {
	[FLASHCARD_SHAPE_TYPE]: { props: flashcardShapeProps },
	[CONCEPT_MAP_SHAPE_TYPE]: { props: conceptMapShapeProps },
	[QUIZ_SHAPE_TYPE]: { props: quizShapeProps },
	[REVIEW_SHAPE_TYPE]: { props: reviewShapeProps },
	[WALKTHROUGH_SHAPE_TYPE]: { props: walkthroughShapeProps },
	[PDF_PAGE_SHAPE_TYPE]: { migrations: pdfPageShapeMigrations, props: pdfPageShapeProps },
} as const

const proposalPositionSchema = {
	x: z.number().finite().min(-1_000_000).max(1_000_000).describe('Canvas x-coordinate in page space.'),
	y: z.number().finite().min(-1_000_000).max(1_000_000).describe('Canvas y-coordinate in page space.'),
}

export const reviewProposalSchema = z.object({
	...proposalPositionSchema,
	title: z.string().trim().min(1).max(100).describe('Short heading for the review note.'),
	body: z.string().trim().min(1).max(800).describe('Constructive feedback shown inside the note.'),
	severity: z.enum(['note', 'check', 'correction']).describe('Whether this is context, validation, or a correction.'),
})

export const flashcardProposalSchema = z.object({
	...proposalPositionSchema,
	cards: z
		.array(
			z.object({
				front: z.string().trim().min(1).max(300).describe('Question or retrieval cue shown first.'),
				back: z.string().trim().min(1).max(600).describe('Answer hidden until the card is flipped.'),
			})
		)
		.min(2)
		.max(6),
})

const quizContentShape = {
	question: z.string().trim().min(1).max(400).describe('Question shown on the quiz card.'),
	options: z.array(z.string().trim().min(1).max(240)).min(2).max(5).describe('Plausible answer choices without labels.'),
	correctIndex: z.number().int().min(0).max(4).describe('Zero-based index of the correct option.'),
	explanation: z.string().trim().min(1).max(600).describe('Explanation revealed after the student answers.'),
}

export const quizProposalSchema = z
	.object({ ...proposalPositionSchema, ...quizContentShape })
		.refine((proposal) => proposal.correctIndex < proposal.options.length, {
			message: 'The correct answer must reference an available option',
			path: ['correctIndex'],
		})

export const walkthroughProposalSchema = z.object({
	...proposalPositionSchema,
	title: z.string().trim().min(1).max(120),
	steps: z.array(z.object({
		prompt: z.string().trim().min(1).max(400).describe('A question or task the student attempts before revealing the explanation.'),
		explanation: z.string().trim().min(1).max(800).describe('The worked step revealed after the attempt.'),
	})).min(2).max(8),
})

export const conceptMapProposalSchema = z.object({
	...proposalPositionSchema,
	title: z.string().trim().min(1).max(120),
	nodes: z.array(z.object({
		id: z.string().trim().min(1).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
		label: z.string().trim().min(1).max(120),
		x: z.number().min(0).max(1).describe('Horizontal position normalized from 0 to 1.'),
		y: z.number().min(0).max(1).describe('Vertical position normalized from 0 to 1.'),
	})).min(2).max(12),
	edges: z.array(z.object({
		from: z.string().trim().min(1).max(40),
		to: z.string().trim().min(1).max(40),
		label: z.string().trim().max(80).default(''),
	})).min(1).max(20),
}).superRefine((proposal, context) => {
	const nodeIDs = new Set(proposal.nodes.map(({ id }) => id))
	for (const [index, edge] of proposal.edges.entries()) {
		if (!nodeIDs.has(edge.from) || !nodeIDs.has(edge.to)) {
			context.addIssue({
				code: 'custom',
				message: 'Every edge must reference available nodes',
				path: ['edges', index],
			})
		}
	}
})

export const practiceSetProposalSchema = z.object({
	...proposalPositionSchema,
	quizzes: z.array(z.object(quizContentShape)).min(2).max(5),
}).superRefine((proposal, context) => {
	for (const [index, quiz] of proposal.quizzes.entries()) {
		if (quiz.correctIndex >= quiz.options.length) {
			context.addIssue({
				code: 'custom',
				message: 'The correct answer must reference an available option',
				path: ['quizzes', index, 'correctIndex'],
			})
		}
	}
})

export type ReviewProposal = z.infer<typeof reviewProposalSchema>
export type FlashcardProposal = z.infer<typeof flashcardProposalSchema>
export type QuizProposal = z.infer<typeof quizProposalSchema>
export type WalkthroughProposal = z.infer<typeof walkthroughProposalSchema>
export type ConceptMapProposal = z.infer<typeof conceptMapProposalSchema>
export type PracticeSetProposal = z.infer<typeof practiceSetProposalSchema>
