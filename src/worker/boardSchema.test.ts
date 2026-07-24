import { CANVAS_CUSTOM_COLOR_NAMES } from '@agentboard/shared'
import { toRichText } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import { boardSchema } from './boardSchema'

describe('boardSchema', () => {
	it('accepts custom colors in synchronized native shapes', () => {
		for (const color of CANVAS_CUSTOM_COLOR_NAMES) {
			const shape = boardSchema.types.shape.create({
				id: `shape:${color}`,
				type: 'geo',
				parentId: 'page:test',
				index: 'a1',
				props: {
					geo: 'rectangle',
					dash: 'solid',
					url: '',
					w: 240,
					h: 120,
					growY: 0,
					scale: 1,
					labelColor: color,
					color,
					fill: 'semi',
					size: 'm',
					font: 'sans',
					align: 'middle',
					verticalAlign: 'middle',
					richText: toRichText('Synchronized custom color'),
				},
			})

			expect(() => boardSchema.types.shape.validator.validate(shape)).not.toThrow()
		}
	})
})
