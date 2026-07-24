import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	readStudyReasoningEffort,
	writeStudyReasoningEffort,
} from './studyPreferences'

describe('study preferences', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('uses medium reasoning when the stored value is missing or invalid', () => {
		vi.stubGlobal('localStorage', {
			getItem: vi.fn(() => 'extreme'),
			setItem: vi.fn(),
		})

		expect(readStudyReasoningEffort()).toBe('medium')
	})

	it('persists and reads the selected reasoning effort', () => {
		const values = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		})

		writeStudyReasoningEffort('high')

		expect(readStudyReasoningEffort()).toBe('high')
	})
})
