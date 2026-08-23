import { describe, expect, it } from 'vitest'
import { getCanvasOptions, NOTE_PAGE_SIZES } from './pageNoteMode'

describe('getCanvasOptions', () => {
	it('keeps canvas spaces infinite', () => {
		expect(getCanvasOptions('canvas')).toEqual({ deepLinks: true })
	})

	it('keeps notebook sheets on one shared canvas', () => {
		const options = getCanvasOptions('pages')

		expect(options.camera).toBeUndefined()
		expect(options.maxPages).toBe(1)
		expect(NOTE_PAGE_SIZES.landscape).toEqual({ h: 816, w: 1_056 })
	})
})
