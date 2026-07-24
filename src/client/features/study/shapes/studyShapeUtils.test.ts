import { describe, expect, it, vi } from 'vitest'
import { canvasInteractionHandlers } from './studyShapeUtils'

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
