import { PDF_PAGE_SHAPE_TYPE } from '@agentboard/shared'
import { describe, expect, it } from 'vitest'
import {
	getOverlappingPDFPageRegions,
	isSinglePDFFrameSelection,
} from './canvasContextCapture'

describe('getOverlappingPDFPageRegions', () => {
	it('includes every PDF page covered by a selected document frame', () => {
		const pageShapes = Array.from({ length: 25 }, (_, index) => ({
			id: `shape:page-${index + 1}`,
			props: {
				documentId: 'document-1',
				pageNumber: index + 1,
			},
			type: PDF_PAGE_SHAPE_TYPE,
			x: 0,
			y: index * 800,
		}))
		const editor = {
			getCurrentPageShapesSorted: () => pageShapes,
			getSelectionPageBounds: () => ({ h: 25 * 800, w: 612, x: 0, y: 0 }),
			getShapePageBounds: (shape: (typeof pageShapes)[number]) => ({
				h: 792,
				w: 612,
				x: shape.x,
				y: shape.y,
			}),
		}

		const regions = getOverlappingPDFPageRegions(
			editor,
			[{}]
		)

		expect(regions).toHaveLength(25)
		expect(regions.at(-1)).toMatchObject({
			documentID: 'document-1',
			pageNumber: 25,
			region: { h: 1, w: 1, x: 0, y: 0 },
		})
	})
})

describe('isSinglePDFFrameSelection', () => {
	it('recognizes a selected frame containing PDF pages', () => {
		const frame = {
			id: 'shape:pdf-frame',
			type: 'frame',
		}
		const page = {
			id: 'shape:page-1',
			type: PDF_PAGE_SHAPE_TYPE,
		}
		const editor = {
			getShape: () => page,
			getSortedChildIdsForParent: () => [page.id],
		}

		expect(isSinglePDFFrameSelection(editor, [frame])).toBe(true)
		expect(isSinglePDFFrameSelection(editor, [frame, page])).toBe(false)
	})
})
