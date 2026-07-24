import { describe, expect, it } from 'vitest'
import { formatCanvasTimerTime } from './canvasTimer'

describe('formatCanvasTimerTime', () => {
	it('formats elapsed minutes and seconds', () => {
		expect(formatCanvasTimerTime(0)).toBe('00:00')
		expect(formatCanvasTimerTime(65_999)).toBe('01:05')
	})

	it('adds an hour segment for longer sessions', () => {
		expect(formatCanvasTimerTime(3_661_000)).toBe('1:01:01')
	})

	it('clamps invalid negative elapsed time to zero', () => {
		expect(formatCanvasTimerTime(-1_000)).toBe('00:00')
	})
})
