import { describe, expect, it } from 'vitest'
import {
	flashcardReviewRatingSchema,
	mistakeProposalSchema,
	registerFlashcardsSchema,
	studyModeSchema,
} from './studyLearning'

describe('study learning contracts', () => {
	it('accepts review registration and learning modes', () => {
		expect(registerFlashcardsSchema.safeParse({
			cards: [{ shapeID: 'shape:one', front: 'Prompt', back: 'Answer' }],
		}).success).toBe(true)
		expect(studyModeSchema.parse('socratic')).toBe('socratic')
		expect(flashcardReviewRatingSchema.parse('good')).toBe('good')
	})

	it('requires stable mistake pattern keys', () => {
		expect(mistakeProposalSchema.safeParse({
			concept: 'Algebra',
			description: 'Distributed a negative sign incorrectly.',
			patternKey: 'negative-distribution',
			title: 'Negative sign distribution',
		}).success).toBe(true)
		expect(mistakeProposalSchema.safeParse({
			concept: 'Algebra',
			description: 'Distributed a negative sign incorrectly.',
			patternKey: 'Negative Distribution',
			title: 'Negative sign distribution',
		}).success).toBe(false)
	})
})
