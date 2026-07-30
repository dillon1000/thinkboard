import { describe, expect, it } from 'vitest'
import {
	gradeDeterministicAnswer,
	gradeFlashcardAnswer,
	normalizeAnswer,
} from './answerGrading'

describe('flashcard answer grading', () => {
	it('normalizes Unicode, Markdown, punctuation, spacing, and line endings', () => {
		expect(normalizeAnswer('  **CAFÉ**,\r\n au lait! ')).toBe('café au lait')
	})

	it('accepts exact primary and alternate answers without AI', () => {
		expect(gradeDeterministicAnswer('Paris', ['Paris', 'The city of Paris'])).toMatchObject({
			gradingMethod: 'exact',
			matchedAnswer: 'Paris',
			verdict: 'correct',
		})
		expect(gradeDeterministicAnswer('City of Light', ['Paris', 'City of Light'])).toMatchObject({
			matchedAnswer: 'City of Light',
			verdict: 'correct',
		})
	})

	it('accepts character edits at ten percent and rejects larger edits', () => {
		expect(gradeDeterministicAnswer('photosynthesiz', ['photosynthesis'])).toMatchObject({
			gradingMethod: 'edit-distance',
		})
		expect(gradeDeterministicAnswer('photosyn', ['photosynthesis'])).toBeNull()
	})

	it('accepts eighty percent word coverage within the length cap', () => {
		expect(gradeDeterministicAnswer(
			'mitochondria produce chemical energy',
			['mitochondria produce stored chemical energy']
		)).toMatchObject({ gradingMethod: 'word-coverage' })
		expect(gradeDeterministicAnswer(
			'mitochondria produce stored chemical energy with unrelated extra words',
			['mitochondria produce stored chemical energy']
		)).toBeNull()
	})

	it('requires negation to agree', () => {
		expect(gradeDeterministicAnswer(
			'viruses are living cells',
			['viruses are not living cells']
		)).toBeNull()
	})

	it('routes non-exact numeric and formula answers to AI', () => {
		expect(gradeDeterministicAnswer('0.50', ['0.5'])).toBeNull()
		expect(gradeDeterministicAnswer('$x = 2$', ['$x=2$'])).toBeNull()
		expect(gradeDeterministicAnswer('$x=2$', ['$x=2$'])).toMatchObject({
			gradingMethod: 'exact',
		})
	})

	it('calls AI once only when deterministic checks cannot decide', async () => {
		let callCount = 0
		let receivedInput: unknown = null
		const ai = {
			run: (_model: string, input: unknown) => {
				callCount += 1
				receivedInput = input
				return Promise.resolve({
					response: {
						matchedAnswerIndex: 0,
						reason: 'The meaning is equivalent.',
						verdict: 'correct',
					},
				})
			},
		}
		await expect(gradeFlashcardAnswer({
			acceptedAnswers: ['The process by which plants convert light into chemical energy.'],
			ai,
			answer: 'Plants turn sunlight into stored chemical energy.',
			front: 'What is photosynthesis?',
			model: 'llama',
		})).resolves.toMatchObject({
			gradingMethod: 'ai',
			matchedAnswer: 'The process by which plants convert light into chemical energy.',
			model: 'llama',
			verdict: 'correct',
		})
		expect(callCount).toBe(1)
		expect(receivedInput).toMatchObject({
			response_format: {
				json_schema: {
					required: ['matchedAnswerIndex', 'reason', 'verdict'],
					type: 'object',
				},
				type: 'json_schema',
			},
			temperature: 0,
		})
	})

	it('does not call AI for a deterministic match', async () => {
		const ai = { run: () => Promise.reject(new Error('AI should not run')) }
		await expect(gradeFlashcardAnswer({
			acceptedAnswers: ['Paris'],
			ai,
			answer: 'Paris',
			front: 'Capital of France?',
			model: 'llama',
		})).resolves.toMatchObject({
			gradingMethod: 'exact',
			model: null,
		})
	})

	it('returns self-grading results for uncertain, malformed, and failed AI responses', async () => {
		await expect(gradeFlashcardAnswer({
			acceptedAnswers: ['Expected answer'],
			ai: {
				run: () => Promise.resolve({
					response: '{"verdict":"uncertain","reason":"The response is ambiguous.","matchedAnswerIndex":null}',
				}),
			},
			answer: 'Maybe',
			front: 'Question',
			model: 'llama',
		})).resolves.toMatchObject({
			gradingMethod: 'ai',
			verdict: 'uncertain',
		})

		let reportedErrors = 0
		for (const run of [
			() => Promise.resolve({ response: 'not json' }),
			() => Promise.reject(new Error('Unavailable')),
		]) {
			await expect(gradeFlashcardAnswer({
				acceptedAnswers: ['Expected answer'],
				ai: { run },
				answer: 'Different response',
				front: 'Question',
				model: 'llama',
				onAIError: () => {
					reportedErrors += 1
				},
			})).resolves.toMatchObject({
				gradingMethod: 'ai-unavailable',
				verdict: 'uncertain',
			})
		}
		expect(reportedErrors).toBe(2)
	})
})
