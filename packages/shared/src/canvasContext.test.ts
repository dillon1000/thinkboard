import { describe, expect, it } from 'vitest'
import { canvasContextSchema } from './canvasContext'

describe('canvasContextSchema', () => {
	it('parses semantic shapes, viewport content, relationships, and the document clock', () => {
		const result = canvasContextSchema.parse({
			boardID: 'board-1',
			documentClock: 27,
			pageID: 'page:one',
			selection: [{
				h: 40,
				id: 'shape:claim',
				rotation: 0,
				text: {
					html: '<p><strong>Claim</strong></p>',
					plainText: 'Claim',
				},
				type: 'text',
				w: 120,
				x: 10,
				y: 20,
			}],
			relationships: [{
				bindingID: 'binding:end',
				connectorShapeID: 'shape:arrow',
				targetShapeID: 'shape:claim',
				terminal: 'end',
				type: 'arrow',
			}],
			viewport: {
				h: 600,
				shapes: [],
				w: 800,
				x: 0,
				y: 0,
				zoom: 1,
			},
		})

		expect(result.documentClock).toBe(27)
		expect(result.selection[0].text?.html).toContain('<strong>')
		expect(result.relatedShapes).toEqual([])
		expect(result.relationships[0]).toMatchObject({ terminal: 'end', type: 'arrow' })
	})

	it('accepts normalized PDF page selection regions', () => {
		const result = canvasContextSchema.parse({
			boardID: 'board-1',
			pdfPageRegions: [{
				documentID: 'document-1',
				pageNumber: 3,
				region: { h: 0.2, w: 0.8, x: 0.1, y: 0.4 },
				shapeID: 'shape:pdf-page',
			}],
			selection: [],
		})

		expect(result.pdfPageRegions?.[0]).toMatchObject({ documentID: 'document-1', pageNumber: 3 })
	})

	it('accepts every page in a selected PDF frame', () => {
		const result = canvasContextSchema.parse({
			boardID: 'board-1',
			pdfPageRegions: Array.from({ length: 200 }, (_, index) => ({
				documentID: 'document-1',
				pageNumber: index + 1,
				region: { h: 1, w: 1, x: 0, y: 0 },
				shapeID: `shape:pdf-page-${index + 1}`,
			})),
			selection: [],
		})

		expect(result.pdfPageRegions).toHaveLength(200)
	})

	it('accepts exact text selected from a PDF page', () => {
		const result = canvasContextSchema.parse({
			boardID: 'board-1',
			pdfTextSelection: {
				documentID: 'document-1',
				pageNumber: 3,
				text: 'The highlighted definition',
			},
			selection: [],
		})

		expect(result.pdfTextSelection).toEqual({
			documentID: 'document-1',
			pageNumber: 3,
			text: 'The highlighted definition',
		})
	})

	it('rejects a negative document clock', () => {
		expect(canvasContextSchema.safeParse({
			boardID: 'board-1',
			documentClock: -1,
			selection: [],
		}).success).toBe(false)
	})

	it('accepts layer, lock, containment, opacity, and style context', () => {
		const result = canvasContextSchema.parse({
			boardID: 'board-1',
			selection: [{
				id: 'shape:frame',
				type: 'frame',
				childShapeIDs: ['shape:child'],
				index: 'a4',
				isLocked: true,
				opacity: 0.75,
				x: 0,
				y: 0,
				w: 400,
				h: 300,
				rotation: 0,
				style: { color: 'agent-blue' },
			}],
		})

		expect(result.selection[0]).toMatchObject({
			childShapeIDs: ['shape:child'],
			index: 'a4',
			isLocked: true,
			opacity: 0.75,
			style: { color: 'agent-blue' },
		})
	})
})
