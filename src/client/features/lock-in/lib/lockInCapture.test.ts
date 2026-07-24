import { describe, expect, it } from 'vitest'
import { getLockInExportScale } from './lockInCapture'

describe('Lock In canvas capture', () => {
	it('keeps small work at its natural scale', () => {
		expect(getLockInExportScale([{ h: 300, w: 500 }], 1_200)).toBe(1)
	})

	it('scales large work inside the review image budget', () => {
		expect(getLockInExportScale([{ h: 800, w: 2_272 }], 1_200)).toBe(0.5)
	})

	it('includes the distance between separate shapes', () => {
		expect(getLockInExportScale([
			{ h: 100, w: 100, x: 0, y: 0 },
			{ h: 100, w: 100, x: 2_172, y: 0 },
		], 1_200)).toBe(0.5)
	})
})
