import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	readBoardFlashcardDirectReveal,
	writeBoardFlashcardDirectReveal,
} from './boardFlashcardPreferences'

describe('board flashcard preferences', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('opens the answering UI when no preference is stored', () => {
		vi.stubGlobal('localStorage', {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
		})

		expect(readBoardFlashcardDirectReveal()).toBe(false)
	})

	it('persists direct reveal for board flashcards', () => {
		const values = new Map<string, string>()
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		})

		writeBoardFlashcardDirectReveal(true)

		expect(readBoardFlashcardDirectReveal()).toBe(true)
	})
})
