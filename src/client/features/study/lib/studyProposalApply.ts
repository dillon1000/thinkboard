import {
	FLASHCARD_SHAPE_TYPE,
	CONCEPT_MAP_SHAPE_TYPE,
	QUIZ_SHAPE_TYPE,
	REVIEW_SHAPE_TYPE,
	WALKTHROUGH_SHAPE_TYPE,
	MATH_SHAPE_TYPE,
	apiRoutes,
	agentMemoryProposalSchema,
	conceptMapProposalSchema,
	equationProposalSchema,
	flashcardProposalSchema,
	quizProposalSchema,
	mistakeProposalSchema,
	normalizeEquationLatex,
	practiceSetProposalSchema,
	reviewProposalSchema,
	walkthroughProposalSchema,
	type CanvasAnchor,
} from '@agentboard/shared'
import { Editor, createShapeId, type TLShapeId, type TLShapePartial } from 'tldraw'
import { apiRequest } from '../../../lib/api'
import type {
	ConceptMapShape,
	FlashcardShape,
	QuizShape,
	ReviewShape,
	WalkthroughShape,
} from '../shapes/studyShapeUtils'
import { measureEquationBoxes, type MathShape } from '../../boards/shapes/MathShapeUtil'
import { applyCanvasPlan } from './canvasPlanApply'

const EQUATION_FONT_SIZE = 28
/** Breathing room between the stacked lines of a derivation. */
const EQUATION_LINE_GAP = 20

export const STUDY_TOOL_NAMES = [
	'addReviewNote',
	'createConceptMap',
	'createFlashcards',
	'createPracticeSet',
	'createQuiz',
	'createWalkthrough',
	'composeCanvas',
	'recordMistake',
	'saveMemory',
	'writeEquation',
] as const

export type StudyToolName = (typeof STUDY_TOOL_NAMES)[number]

export interface ProposalEffect {
	/** Empty for proposals that write to the student's history rather than the board. */
	shapeIDs: TLShapeId[]
	flashcards?: Array<{ back: string; front: string; shapeID: string }>
}

interface ApplyProposalOptions {
	/**
	 * Forces placement, overriding the coordinates the model chose. Inline requests pass the
	 * student's cursor so an artifact cannot land somewhere off screen.
	 */
	anchor?: CanvasAnchor
	/** Rejects plans produced from an older board snapshot. */
	documentClock?: number
	/** Leaves the new shapes unselected, which an inline preview handles for itself. */
	select?: boolean
}

export function applyProposal(
	editor: Editor,
	toolName: string,
	input: unknown,
	{ anchor, documentClock, select = true }: ApplyProposalOptions = {}
): ProposalEffect {
	function place<T extends { x: number; y: number }>(proposal: T): T {
		return anchor ? { ...proposal, x: anchor.x, y: anchor.y } : proposal
	}

	function finish(shapeIDs: TLShapeId[]) {
		if (select) editor.setSelectedShapes(shapeIDs)
		return { shapeIDs }
	}

	if (toolName === 'composeCanvas') {
		return applyCanvasPlan(editor, input, { anchor, documentClock, select })
	}

	if (toolName === 'addReviewNote') {
		const proposal = place(reviewProposalSchema.parse(input))
		const id = createShapeId()
		const shape: TLShapePartial<ReviewShape> = {
			id,
			type: REVIEW_SHAPE_TYPE,
			x: proposal.x,
			y: proposal.y,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'review' } },
			props: {
				w: 310,
				h: 210,
				title: proposal.title,
				body: proposal.body,
				severity: proposal.severity,
				resolved: false,
				schemaVersion: 1,
			},
		}
		editor.createShape(shape)
		return finish([id])
	}

	if (toolName === 'createFlashcards') {
		const proposal = place(flashcardProposalSchema.parse(input))
		const shapeIDs = proposal.cards.map(() => createShapeId())
		const shapes: TLShapePartial<FlashcardShape>[] = proposal.cards.map((card, index) => ({
			id: shapeIDs[index],
			type: FLASHCARD_SHAPE_TYPE,
			x: proposal.x + (index % 3) * 325,
			y: proposal.y + Math.floor(index / 3) * 215,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'flashcard' } },
			props: {
				w: 300,
				h: 190,
				front: card.front,
				back: card.back,
				revealed: false,
				schemaVersion: 1,
			},
		}))
		editor.createShapes(shapes)
		return {
			...finish(shapeIDs),
			flashcards: proposal.cards.map((card, index) => ({ ...card, shapeID: shapeIDs[index] })),
		}
	}

	if (toolName === 'createQuiz') {
		const proposal = place(quizProposalSchema.parse(input))
		const id = createShapeId()
		const shape: TLShapePartial<QuizShape> = {
			id,
			type: QUIZ_SHAPE_TYPE,
			x: proposal.x,
			y: proposal.y,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'quiz' } },
			props: {
				w: 370,
				h: 350,
				question: proposal.question,
				options: proposal.options,
				correctIndex: proposal.correctIndex,
				explanation: proposal.explanation,
				selectedIndex: -1,
				showResult: false,
				schemaVersion: 1,
			},
		}
		editor.createShape(shape)
		return finish([id])
	}

	if (toolName === 'createWalkthrough') {
		const proposal = place(walkthroughProposalSchema.parse(input))
		const id = createShapeId()
		const shape: TLShapePartial<WalkthroughShape> = {
			id,
			type: WALKTHROUGH_SHAPE_TYPE,
			x: proposal.x,
			y: proposal.y,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'walkthrough' } },
			props: {
				w: 430,
				h: 340,
				title: proposal.title,
				steps: proposal.steps,
				currentStep: 0,
				revealed: false,
				schemaVersion: 1,
			},
		}
		editor.createShape(shape)
		return finish([id])
	}

	if (toolName === 'createConceptMap') {
		const proposal = place(conceptMapProposalSchema.parse(input))
		const id = createShapeId()
		const shape: TLShapePartial<ConceptMapShape> = {
			id,
			type: CONCEPT_MAP_SHAPE_TYPE,
			x: proposal.x,
			y: proposal.y,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'concept-map' } },
			props: {
				w: 580,
				h: 410,
				title: proposal.title,
				nodes: proposal.nodes,
				edges: proposal.edges,
				schemaVersion: 1,
			},
		}
		editor.createShape(shape)
		return finish([id])
	}

	if (toolName === 'createPracticeSet') {
		const proposal = place(practiceSetProposalSchema.parse(input))
		const shapeIDs = proposal.quizzes.map(() => createShapeId())
		const shapes: TLShapePartial<QuizShape>[] = proposal.quizzes.map((quiz, index) => ({
			id: shapeIDs[index],
			type: QUIZ_SHAPE_TYPE,
			x: proposal.x + (index % 2) * 390,
			y: proposal.y + Math.floor(index / 2) * 370,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'practice-set' } },
			props: {
				w: 370,
				h: 350,
				question: quiz.question,
				options: quiz.options,
				correctIndex: quiz.correctIndex,
				explanation: quiz.explanation,
				selectedIndex: -1,
				showResult: false,
				schemaVersion: 1,
			},
		}))
		editor.createShapes(shapes)
		return finish(shapeIDs)
	}

	if (toolName === 'writeEquation') {
		const proposal = place(equationProposalSchema.parse(input))
		const latexLines = proposal.lines.map(normalizeEquationLatex)
		const shapeIDs = latexLines.map(() => createShapeId())
		// Each line is its own shape so the student can move or correct a single step. Lines are
		// measured first: a line carrying a fraction is far taller than a plain one, and a fixed
		// stride would run the two together.
		const boxes = measureEquationBoxes(latexLines, EQUATION_FONT_SIZE)
		let lineY = proposal.y
		const shapes: TLShapePartial<MathShape>[] = latexLines.map((latex, index) => {
			const y = lineY
			lineY += boxes[index].h + EQUATION_LINE_GAP
			return {
				id: shapeIDs[index],
				type: MATH_SHAPE_TYPE,
				x: proposal.x,
				y,
				meta: { agentboard: { createdBy: 'study-agent', proposalType: 'equation' } },
				props: {
					w: boxes[index].w,
					h: boxes[index].h,
					latex,
					fontSize: EQUATION_FONT_SIZE,
					schemaVersion: 1,
				},
			}
		})
		editor.createShapes(shapes)
		return finish(shapeIDs)
	}

	throw new Error(`Unknown proposal type: ${toolName}`)
}

export async function persistProposalEffect(boardID: string, effect: ProposalEffect) {
	if (!effect.flashcards?.length) return
	await apiRequest(apiRoutes.boardFlashcards(boardID), {
		body: JSON.stringify({ cards: effect.flashcards }),
		method: 'POST',
	}).catch(() => undefined)
}

export async function recordProposedMistake(boardID: string, input: unknown) {
	await apiRequest(apiRoutes.boardMistakes(boardID), {
		body: JSON.stringify(mistakeProposalSchema.parse(input)),
		method: 'POST',
	})
}

export async function saveProposedMemory(boardID: string, input: unknown) {
	await apiRequest(apiRoutes.boardMemories(boardID), {
		body: JSON.stringify(agentMemoryProposalSchema.parse(input)),
		method: 'POST',
	})
}

export function isStudyToolName(value: string): value is StudyToolName {
	return (STUDY_TOOL_NAMES as readonly string[]).includes(value)
}
