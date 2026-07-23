import { createTLSchemaFromUtils } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import {
	ConceptMapShapeUtil,
	FlashcardShapeUtil,
	QuizShapeUtil,
	PDFPageShapeUtil,
	ReviewShapeUtil,
	WalkthroughShapeUtil,
	canvasInteractionHandlers,
	synchronizedShapeUtils,
} from './studyShapeUtils'

describe('canvasInteractionHandlers', () => {
	it('keeps pointer and touch gestures inside interactive study shapes', () => {
		const stopPropagation = vi.fn()
		const event = { stopPropagation }

		canvasInteractionHandlers.onPointerDown(event)
		canvasInteractionHandlers.onTouchStart(event)
		canvasInteractionHandlers.onTouchEnd(event)

		expect(stopPropagation).toHaveBeenCalledTimes(3)
	})
})

describe('synchronizedShapeUtils', () => {
	it('creates a schema with built-in and study shape migrations', () => {
		expect(() => createTLSchemaFromUtils({ shapeUtils: synchronizedShapeUtils })).not.toThrow()
		expect(synchronizedShapeUtils).toEqual(
			expect.arrayContaining([
				ConceptMapShapeUtil,
				FlashcardShapeUtil,
				QuizShapeUtil,
				PDFPageShapeUtil,
				ReviewShapeUtil,
				WalkthroughShapeUtil,
			])
		)
	})
})
