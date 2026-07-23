import { describe, expect, it } from 'vitest'
import {
	getStudyToolContinuation,
	getStudyToolContinuationInstruction,
} from './studyToolContinuation'

describe('getStudyToolContinuation', () => {
	it('recognizes an applied proposal result', () => {
		expect(getStudyToolContinuation([
			{
				role: 'assistant',
				parts: [{ type: 'tool-createFlashcards', state: 'output-available', output: { applied: true } }],
			},
		])).toBe('applied')
	})

	it('recognizes a dismissed proposal result', () => {
		expect(getStudyToolContinuation([
			{
				role: 'assistant',
				parts: [{ type: 'tool-createQuiz', state: 'output-available', output: { applied: false } }],
			},
		])).toBe('dismissed')
	})

	it('ignores an ordinary assistant response', () => {
		expect(getStudyToolContinuation([
			{ role: 'assistant', parts: [{ type: 'text' }] },
		])).toBeUndefined()
	})
})

describe('getStudyToolContinuationInstruction', () => {
	it('states that an automatic continuation is not an empty message', () => {
		expect(getStudyToolContinuationInstruction('applied')).toContain(
			'there is no missing or empty user message'
		)
	})
})
