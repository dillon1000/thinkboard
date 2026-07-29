import { describe, expect, it } from 'vitest'
import {
	DEFAULT_AGENT_PROFILE,
	agentMemoryProposalSchema,
	agentProfileSchema,
	flashcardReviewRatingSchema,
	manualAgentMemorySchema,
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

	it('accepts bounded memory proposals with stable keys', () => {
		expect(agentMemoryProposalSchema.safeParse({
			content: 'Prefers one hint at a time before seeing a full solution.',
			kind: 'preference',
			memoryKey: 'hint-pacing',
			title: 'Hint pacing',
			topic: 'Study style',
		}).success).toBe(true)
		expect(agentMemoryProposalSchema.safeParse({
			content: 'Remember this.',
			kind: 'private-secret',
			memoryKey: 'Invalid Key',
			title: 'Invalid',
			topic: 'Study style',
		}).success).toBe(false)
	})

	it('validates manual memories and agent profiles', () => {
		expect(manualAgentMemorySchema.safeParse({
			content: 'I am preparing for an organic chemistry exam.',
			kind: 'goal',
			title: 'Organic chemistry exam',
			topic: 'Chemistry',
		}).success).toBe(true)
		expect(agentProfileSchema.parse(DEFAULT_AGENT_PROFILE)).toEqual(DEFAULT_AGENT_PROFILE)
		expect(agentProfileSchema.safeParse({
			...DEFAULT_AGENT_PROFILE,
			personality: 'comedian',
		}).success).toBe(false)
	})
})
