import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import {
	conceptMapProposalSchema,
	equationProposalSchema,
	flashcardProposalSchema,
	flashcardShapeMigrations,
	flashcardShapeValidator,
	lectureShapeValidator,
	quizProposalSchema,
	reviewProposalSchema,
	normalizeEquationLatex,
	studyShapeSchemas,
	studyPackProposalSchema,
	teachBackShapeValidator,
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

		const proposal = flashcardProposalSchema.parse({
			x: 20,
			y: 30,
			cards: [
				{ front: 'Question one', back: 'Answer one' },
				{ front: 'Question two', back: 'Answer two' },
			],
		})
		expect(proposal.cards[0].alternateAnswers).toEqual([])
		expect(flashcardProposalSchema.safeParse({
			x: 20,
			y: 30,
			cards: [
				{
					front: 'Question one',
					back: 'Answer one',
					alternateAnswers: ['1', '2', '3', '4', '5', '6'],
				},
				{ front: 'Question two', back: 'Answer two' },
			],
		}).success).toBe(false)
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
			alternateAnswers: ['Accepted alternative'],
			revealed: false,
			schemaVersion: 1,
		}

		expect(() => flashcardShapeValidator.validate(props)).not.toThrow()
	})

	it('validates a persisted Teach Back response', () => {
		expect(() => teachBackShapeValidator.validate({
			feedback: 'Good core explanation.',
			h: 500,
			response: 'Entropy counts compatible microstates.',
			schemaVersion: 1,
			score: 84,
			sourceText: 'Entropy is proportional to the logarithm of multiplicity.',
			topic: 'Explain entropy',
			verdict: 'partial',
			w: 430,
		})).not.toThrow()
	})

	it('validates a persisted lecture player', () => {
		expect(() => lectureShapeValidator.validate({
			h: 500,
			lectureID: 'lecture-1',
			schemaVersion: 1,
			title: 'Week 4 review',
			w: 520,
		})).not.toThrow()
	})

	it('adds an empty alternate list to existing flashcards', () => {
		const props = {
			w: 300,
			h: 190,
			front: 'Question',
			back: 'Answer',
			revealed: false,
			schemaVersion: 1,
		}

		const migration = flashcardShapeMigrations.sequence[0]
		if (!('up' in migration)) throw new Error('Expected a flashcard property migration')
		migration.up(props)

		expect(props).toMatchObject({ alternateAnswers: [] })
	})

	it('compacts default-sized existing flashcards without changing custom sizes', () => {
		const defaultSize = { w: 300, h: 190 }
		const customSize = { w: 360, h: 240 }
		const migration = flashcardShapeMigrations.sequence[1]
		if (!('up' in migration)) throw new Error('Expected a flashcard size migration')

		migration.up(defaultSize)
		migration.up(customSize)

		expect(defaultSize).toEqual({ w: 220, h: 118 })
		expect(customSize).toEqual({ w: 360, h: 240 })
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

	it('accepts a derivation of bounded equation lines', () => {
		expect(equationProposalSchema.safeParse({
			x: 40,
			y: 60,
			lines: ['ax^2 + bx + c = 0', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'],
		}).success).toBe(true)
	})

	it('accepts a bounded study pack with exact PDF sources', () => {
		expect(studyPackProposalSchema.safeParse({
			x: 40,
			y: 60,
			title: 'Cell energy',
			sources: [{
				documentID: 'biology-notes',
				documentTitle: 'Biology notes',
				pageNumber: 12,
			}],
			cards: [
				{ front: 'What does ATP carry?', back: 'Usable chemical energy.' },
				{ front: 'Where is ATP produced?', back: 'Mostly in mitochondria.' },
			],
			quizzes: [{
				question: 'Which organelle produces most ATP?',
				options: ['Nucleus', 'Mitochondrion'],
				correctIndex: 1,
				explanation: 'Cellular respiration occurs in mitochondria.',
			}],
			conceptMap: {
				title: 'Energy flow',
				nodes: [
					{ id: 'glucose', label: 'Glucose', x: 0.2, y: 0.5 },
					{ id: 'atp', label: 'ATP', x: 0.8, y: 0.5 },
				],
				edges: [{ from: 'glucose', to: 'atp', label: 'is converted into' }],
			},
		}).success).toBe(true)
	})

	it('rejects an equation proposal with no lines', () => {
		expect(equationProposalSchema.safeParse({ x: 0, y: 0, lines: [] }).success).toBe(false)
	})
})

describe('normalizeEquationLatex', () => {
	it('strips the math delimiters models add out of habit', () => {
		expect(normalizeEquationLatex('$$x = 1$$')).toBe('x = 1')
		expect(normalizeEquationLatex('$x = 1$')).toBe('x = 1')
		expect(normalizeEquationLatex('\\[x = 1\\]')).toBe('x = 1')
		expect(normalizeEquationLatex('\\(x = 1\\)')).toBe('x = 1')
	})

	it('leaves bare LaTeX and inner dollar-free math untouched', () => {
		expect(normalizeEquationLatex('  \\frac{1}{2}  ')).toBe('\\frac{1}{2}')
		expect(normalizeEquationLatex('a + b = c')).toBe('a + b = c')
	})

	it('drops a trailing row break left over from an aligned block', () => {
		expect(normalizeEquationLatex('x = 2 \\\\')).toBe('x = 2')
	})
})
