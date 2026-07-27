import { CRAFT_DOCUMENT_SHAPE_TYPE, type CraftDocumentLink } from '@agentboard/shared'
import type { Editor } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import {
	addCraftDocumentShape,
	removeCraftDocumentShapes,
} from './CraftDocumentShapeUtil'

const DOCUMENT: CraftDocumentLink = {
	canEdit: true,
	createdAt: '2026-07-27T00:00:00.000Z',
	documentID: 'craft-document-id',
	id: 'link-id',
	title: 'Study notes',
}

describe('Craft document canvas shapes', () => {
	it('adds and selects a linked document in the visible board area', () => {
		const createShape = vi.fn()
		const select = vi.fn()
		const editor = {
			createShape,
			getCurrentPageShapes: () => [],
			getViewportPageBounds: () => ({ h: 800, w: 1_200, x: 100, y: 200 }),
			markHistoryStoppingPoint: vi.fn(),
			select,
		} as unknown as Editor

		const shapeID = addCraftDocumentShape(editor, DOCUMENT)

		expect(createShape).toHaveBeenCalledWith(expect.objectContaining({
			id: shapeID,
			props: expect.objectContaining({
				documentID: DOCUMENT.documentID,
				linkID: DOCUMENT.id,
				title: DOCUMENT.title,
			}),
			type: CRAFT_DOCUMENT_SHAPE_TYPE,
			x: 132,
			y: 296,
		}))
		expect(select).toHaveBeenCalledWith(shapeID)
	})

	it('selects an existing document shape without adding a copy', () => {
		const createShape = vi.fn()
		const select = vi.fn()
		const existing = {
			id: 'shape:existing',
			props: {
				documentID: DOCUMENT.documentID,
				h: 150,
				linkID: DOCUMENT.id,
				schemaVersion: 1,
				title: DOCUMENT.title,
				w: 320,
			},
			type: CRAFT_DOCUMENT_SHAPE_TYPE,
		}
		const editor = {
			createShape,
			getCurrentPageShapes: () => [existing],
			select,
		} as unknown as Editor

		expect(addCraftDocumentShape(editor, DOCUMENT)).toBe(existing.id)
		expect(createShape).not.toHaveBeenCalled()
		expect(select).toHaveBeenCalledWith(existing.id)
	})

	it('removes the canvas shape for a deleted board link', () => {
		const deleteShapes = vi.fn()
		const editor = {
			deleteShapes,
			getCurrentPageShapes: () => [{
				id: 'shape:craft',
				props: { linkID: DOCUMENT.id },
				type: CRAFT_DOCUMENT_SHAPE_TYPE,
			}, {
				id: 'shape:other',
				props: { linkID: 'other-link' },
				type: CRAFT_DOCUMENT_SHAPE_TYPE,
			}],
		} as unknown as Editor

		removeCraftDocumentShapes(editor, DOCUMENT.id)

		expect(deleteShapes).toHaveBeenCalledWith(['shape:craft'])
	})
})
