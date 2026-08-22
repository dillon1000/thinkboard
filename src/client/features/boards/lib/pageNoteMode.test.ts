import { describe, expect, it } from 'vitest'
import { getCanvasOptions, NOTE_PAGE_SIZE } from './pageNoteMode'

describe('getCanvasOptions', () => {
	it('keeps canvas spaces infinite', () => {
		expect(getCanvasOptions('canvas')).toEqual({ deepLinks: true })
	})

	it('fits page spaces to a portrait sheet', () => {
		const options = getCanvasOptions('pages')

		expect(options.camera?.constraints).toMatchObject({
			behavior: 'contain',
			bounds: { h: NOTE_PAGE_SIZE.h, w: NOTE_PAGE_SIZE.w, x: 0, y: 0 },
			initialZoom: 'fit-min-100',
		})
	})
})
