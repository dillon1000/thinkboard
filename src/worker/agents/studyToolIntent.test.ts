import { describe, expect, it } from 'vitest'
import { getRequestedStudyTool } from './studyToolIntent'

describe('getRequestedStudyTool', () => {
	it('forces the flashcard tool for an explicit creation request', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Turn the selected notes into flashcards.' }] },
		])).toBe('createFlashcards')
	})

	it('does not force another tool after an assistant tool step', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Make flashcards.' }] },
			{ role: 'assistant', parts: [{ type: 'text', text: 'Done.' }] },
		])).toBeUndefined()
	})

	it('keeps ordinary questions in automatic tool mode', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Why are flashcards useful?' }] },
		])).toBeUndefined()
	})

	it('forces the review-note tool when the student asks to add a correction', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Please add this correction to the canvas.' }] },
		])).toBe('addReviewNote')
	})

	it('forces the quiz tool for an explicit quiz request', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Create a quiz from this diagram.' }] },
		])).toBe('createQuiz')
	})

	it('routes richer study artifact requests', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Make me three more practice problems like this.' }] },
		])).toBe('createPracticeSet')
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Create three similar quiz questions for practice.' }] },
		])).toBe('createPracticeSet')
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Summarize this unit as a concept map.' }] },
		])).toBe('createConceptMap')
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Create a step-by-step worked example.' }] },
		])).toBe('createWalkthrough')
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Write the quadratic formula on the board.' }] },
		])).toBe('writeEquation')
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Show the derivation on the canvas.' }] },
		])).toBe('writeEquation')
	})

	it('routes native board composition and editing requests', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Draw three boxes and connect them with arrows.' }] },
		])).toBe('composeCanvas')
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Move this shape south and color it teal.' }] },
		])).toBe('composeCanvas')
	})

	it('leaves Craft document edits in automatic tool mode', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Change the text in my Craft document.' }] },
		])).toBeUndefined()
	})

	it('forces the memory tool for an explicit remember request', () => {
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Remember that I prefer one hint at a time.' }] },
		])).toBe('saveMemory')
		expect(getRequestedStudyTool([
			{ role: 'user', parts: [{ type: 'text', text: 'Save this mistake so we can track it.' }] },
		])).toBe('saveMemory')
	})
})
