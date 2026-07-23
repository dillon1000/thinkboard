import { describe, expect, it, vi } from 'vitest'
import { resolveCanvasContextForRequest } from './canvasContextRequest'

describe('resolveCanvasContextForRequest', () => {
	it('captures the current selection for a new user message', async () => {
		const capture = vi.fn(async () => ({ selection: ['new'] }))

		const result = await resolveCanvasContextForRequest({
			capture,
			messages: [{ role: 'user' }],
			previous: { selection: ['old'] },
		})

		expect(result).toEqual({ selection: ['new'] })
		expect(capture).toHaveBeenCalledOnce()
	})

	it('reuses the user turn selection for an automatic assistant continuation', async () => {
		const capture = vi.fn(async () => ({ selection: ['generated-card'] }))
		const previous = { selection: ['original-notes'] }

		const result = await resolveCanvasContextForRequest({
			capture,
			messages: [{ role: 'user' }, { role: 'assistant' }],
			previous,
		})

		expect(result).toBe(previous)
		expect(capture).not.toHaveBeenCalled()
	})

	it('captures context when a restored conversation has no turn snapshot', async () => {
		const capture = vi.fn(async () => ({ selection: ['current'] }))

		const result = await resolveCanvasContextForRequest({
			capture,
			messages: [{ role: 'assistant' }],
			previous: null,
		})

		expect(result).toEqual({ selection: ['current'] })
	})
})
