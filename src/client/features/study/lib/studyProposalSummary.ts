import {
	conceptMapProposalSchema,
	normalizeCanvasPlanInput,
	equationProposalSchema,
	flashcardProposalSchema,
	quizProposalSchema,
	mistakeProposalSchema,
	practiceSetProposalSchema,
	reviewProposalSchema,
	walkthroughProposalSchema,
} from '@agentboard/shared'

/** The label an inline preview shows while the student decides whether to keep the artifact. */
export function proposalShortLabel(toolName: string) {
	if (toolName === 'addReviewNote') return 'Review note'
	if (toolName === 'createFlashcards') return 'Flashcards'
	if (toolName === 'createQuiz') return 'Quiz'
	if (toolName === 'createWalkthrough') return 'Worked example'
	if (toolName === 'createConceptMap') return 'Concept map'
	if (toolName === 'createPracticeSet') return 'Practice set'
	if (toolName === 'writeEquation') return 'Equation'
	if (toolName === 'composeCanvas') return 'Canvas composition'
	if (toolName === 'recordMistake') return 'Mistake record'
	return 'Board item'
}

export interface ProposalPreview {
	description: string
	details: Array<{ label: string; value: string }>
}

/**
 * Describes the artifact without exposing content intended to stay hidden until the student
 * interacts with it on the board.
 */
export function getProposalPreview(toolName: string, input: unknown): ProposalPreview {
	const description = summarizeProposal(toolName, input)

	if (toolName === 'addReviewNote') {
		const proposal = reviewProposalSchema.safeParse(input)
		if (proposal.success) {
			return {
				description,
				details: [
					{ label: 'Title', value: proposal.data.title },
					{ label: 'Note', value: proposal.data.body },
				],
			}
		}
	}
	if (toolName === 'createFlashcards') {
		const proposal = flashcardProposalSchema.safeParse(input)
		if (proposal.success) {
			return {
				description,
				details: proposal.data.cards.map((card, index) => ({
					label: `Card ${index + 1}`,
					value: card.front,
				})),
			}
		}
	}
	if (toolName === 'createQuiz') {
		const proposal = quizProposalSchema.safeParse(input)
		if (proposal.success) {
			return {
				description,
				details: [
					{ label: 'Question', value: proposal.data.question },
					{ label: 'Choices', value: proposal.data.options.join(' · ') },
				],
			}
		}
	}
	if (toolName === 'createWalkthrough') {
		const proposal = walkthroughProposalSchema.safeParse(input)
		if (proposal.success) {
			return {
				description,
				details: [
					{ label: 'Title', value: proposal.data.title },
					...proposal.data.steps.map((step, index) => ({
						label: `Step ${index + 1}`,
						value: step.prompt,
					})),
				],
			}
		}
	}
	if (toolName === 'createConceptMap') {
		const proposal = conceptMapProposalSchema.safeParse(input)
		if (proposal.success) {
			return {
				description,
				details: [
					{ label: 'Title', value: proposal.data.title },
					{ label: 'Concepts', value: proposal.data.nodes.map(({ label }) => label).join(' · ') },
				],
			}
		}
	}
	if (toolName === 'createPracticeSet') {
		const proposal = practiceSetProposalSchema.safeParse(input)
		if (proposal.success) {
			return {
				description,
				details: proposal.data.quizzes.map((quiz, index) => ({
					label: `Problem ${index + 1}`,
					value: quiz.question,
				})),
			}
		}
	}
	if (toolName === 'writeEquation') {
		const proposal = equationProposalSchema.safeParse(input)
		if (proposal.success) {
			return {
				description,
				details: proposal.data.lines.map((line, index) => ({
					label: proposal.data.lines.length === 1 ? 'Equation' : `Line ${index + 1}`,
					value: line,
				})),
			}
		}
	}
	if (toolName === 'recordMistake') {
		const proposal = mistakeProposalSchema.safeParse(input)
		if (proposal.success) {
			return {
				description,
				details: [
					{ label: 'Pattern', value: proposal.data.title },
					{ label: 'Concept', value: proposal.data.concept },
					{ label: 'Detail', value: proposal.data.description },
				],
			}
		}
	}
	if (toolName === 'composeCanvas') {
		const proposal = parseCanvasPlan(input)
		if (proposal) {
			return {
				description,
				details: [
					{ label: 'Shapes', value: String(proposal.elements.length) },
					{ label: 'Connectors', value: String(proposal.connectors.length) },
					{ label: 'Layouts', value: proposal.layouts.map(({ type }) => type).join(' · ') || 'Relative placement' },
					{ label: 'Edits', value: String(proposal.edits.length + proposal.deletes.length) },
				],
			}
		}
	}

	return { description, details: [] }
}

export function summarizeProposal(toolName: string, input: unknown) {
	if (toolName === 'createFlashcards') {
		const proposal = flashcardProposalSchema.safeParse(input)
		return proposal.success
			? `${proposal.data.cards.length} flashcards ready. Answers stay hidden until each card is flipped.`
			: 'Preparing flashcards…'
	}
	if (toolName === 'createQuiz') {
		const proposal = quizProposalSchema.safeParse(input)
		return proposal.success
			? `One ${proposal.data.options.length}-option quiz ready. The answer stays hidden until you choose.`
			: 'Preparing a quiz…'
	}
	if (toolName === 'addReviewNote') {
		return reviewProposalSchema.safeParse(input).success
			? 'A private review note is ready to place beside the selected work.'
			: 'Preparing a review note…'
	}
	if (toolName === 'createWalkthrough') {
		const proposal = walkthroughProposalSchema.safeParse(input)
		return proposal.success ? `${proposal.data.steps.length} guided steps, revealed one at a time.` : 'Preparing a worked example…'
	}
	if (toolName === 'createConceptMap') {
		const proposal = conceptMapProposalSchema.safeParse(input)
		return proposal.success ? `${proposal.data.nodes.length} concepts with ${proposal.data.edges.length} explicit relationships.` : 'Preparing a concept map…'
	}
	if (toolName === 'createPracticeSet') {
		const proposal = practiceSetProposalSchema.safeParse(input)
		return proposal.success ? `${proposal.data.quizzes.length} new interactive practice problems.` : 'Preparing practice problems…'
	}
	if (toolName === 'writeEquation') {
		const proposal = equationProposalSchema.safeParse(input)
		if (!proposal.success) return 'Preparing an equation…'
		return proposal.data.lines.length === 1
			? 'One typeset equation, ready to place and edit.'
			: `${proposal.data.lines.length} equations, laid out one step per line.`
	}
	if (toolName === 'recordMistake') {
		const proposal = mistakeProposalSchema.safeParse(input)
		return proposal.success ? `${proposal.data.title} will be saved to your private learning history.` : 'Preparing a mistake record…'
	}
	if (toolName === 'composeCanvas') {
		const proposal = parseCanvasPlan(input)
		if (!proposal) return 'Preparing a canvas composition…'
		const objectCount = proposal.elements.length + proposal.connectors.length
		const editCount = proposal.edits.length + proposal.deletes.length
		return `${objectCount} board objects${editCount ? ` and ${editCount} edits` : ''}, arranged with native canvas tools.`
	}
	return 'A board item is ready for review.'
}

function parseCanvasPlan(input: unknown) {
	try {
		return normalizeCanvasPlanInput(input)
	} catch {
		return undefined
	}
}
