import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	readDueReviewVisibility,
	writeDueReviewVisibility,
} from './dueReviewPreferences'

describe('due review preferences', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('shows due reviews when no preference is stored', () => {
		vi.stubGlobal('localStorage', {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
		})

		expect(readDueReviewVisibility()).toBe(true)
	})

	it('persists due review visibility', () => {
		const values = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		})

		writeDueReviewVisibility(false)
		expect(readDueReviewVisibility()).toBe(false)

		writeDueReviewVisibility(true)
		expect(readDueReviewVisibility()).toBe(true)
	})
})
