import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import {
	conceptMapProposalSchema,
	flashcardProposalSchema,
	flashcardShapeValidator,
	quizProposalSchema,
	reviewProposalSchema,
	studyShapeSchemas,
	walkthroughProposalSchema,
} from './studyShapes'

describe('study shape contracts', () => {
	it('compose with the complete built-in tldraw schema', () => {
		expect(() =>
			createTLSchema({
				shapes: { ...defaultShapeSchemas, ...studyShapeSchemas },
				bindings: defaultBindingSchemas,
			})
		).not.toThrow()
	})

	it('accepts bounded review and flashcard proposals', () => {
		expect(
			reviewProposalSchema.safeParse({
				x: 20,
				y: 30,
				title: 'Check the sign',
				body: 'The derivative should be negative here.',
				severity: 'correction',
			}).success
		).toBe(true)

		expect(
			flashcardProposalSchema.safeParse({
				x: 20,
				y: 30,
				cards: [
					{ front: 'What is ATP?', back: 'The primary energy carrier in cells.' },
					{ front: 'Where is ATP made?', back: 'Mostly in mitochondria.' },
				],
			}).success
		).toBe(true)
	})

	it('rejects a quiz answer outside of its options', () => {
		const result = quizProposalSchema.safeParse({
			x: 0,
			y: 0,
			question: 'Which is correct?',
			options: ['A', 'B'],
			correctIndex: 4,
			explanation: 'B is correct.',
		})
		expect(result.success).toBe(false)
	})

	it('validates persisted flashcard properties', () => {
		const props = {
			w: 300,
			h: 190,
			front: 'Question',
			back: 'Answer',
			revealed: false,
			schemaVersion: 1,
		}

		expect(() => flashcardShapeValidator.validate(props)).not.toThrow()
	})

	it('validates worked walkthroughs and connected concept maps', () => {
		expect(walkthroughProposalSchema.safeParse({
			x: 10,
			y: 20,
			title: 'Solve a linear equation',
			steps: [
				{ prompt: 'What should you undo first?', explanation: 'Subtract 4 from both sides.' },
				{ prompt: 'How do you isolate x?', explanation: 'Divide both sides by 2.' },
			],
		}).success).toBe(true)
		expect(conceptMapProposalSchema.safeParse({
			x: 10,
			y: 20,
			title: 'Cell energy',
			nodes: [
				{ id: 'glucose', label: 'Glucose', x: 0.2, y: 0.5 },
				{ id: 'atp', label: 'ATP', x: 0.8, y: 0.5 },
			],
			edges: [{ from: 'glucose', to: 'atp', label: 'becomes usable energy' }],
		}).success).toBe(true)
	})

	it('rejects concept-map edges with missing nodes', () => {
		expect(conceptMapProposalSchema.safeParse({
			x: 0,
			y: 0,
			title: 'Broken map',
			nodes: [
				{ id: 'one', label: 'One', x: 0.2, y: 0.5 },
				{ id: 'two', label: 'Two', x: 0.8, y: 0.5 },
			],
			edges: [{ from: 'one', to: 'missing', label: '' }],
		}).success).toBe(false)
	})
})
