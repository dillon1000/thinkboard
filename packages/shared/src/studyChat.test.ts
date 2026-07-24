import { describe, expect, it } from 'vitest'
import {
	DEFAULT_STUDY_REASONING_EFFORT,
	STUDY_REASONING_EFFORTS,
	studyReasoningEffortSchema,
} from './studyChat'

describe('study chat contracts', () => {
	it('supports every Workers AI reasoning effort', () => {
		expect(STUDY_REASONING_EFFORTS).toEqual(['low', 'medium', 'high'])
		expect(STUDY_REASONING_EFFORTS.map((effort) =>
			studyReasoningEffortSchema.parse(effort)
		)).toEqual(STUDY_REASONING_EFFORTS)
	})

	it('uses medium reasoning by default', () => {
		expect(DEFAULT_STUDY_REASONING_EFFORT).toBe('medium')
		expect(studyReasoningEffortSchema.safeParse('extreme').success).toBe(false)
	})
})
