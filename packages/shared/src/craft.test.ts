import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import {
	craftDocumentBlocksUpdateInputSchema,
	craftDocumentShapeValidator,
	craftShapeSchemas,
	craftWhiteboardSaveInputSchema,
	createCraftWhiteboardRevision,
} from './craft'

describe('Craft document shape contracts', () => {
	it('composes with the built-in tldraw schema', () => {
		expect(() =>
			createTLSchema({
				bindings: defaultBindingSchemas,
				shapes: { ...defaultShapeSchemas, ...craftShapeSchemas },
			})
		).not.toThrow()
	})

	it('validates persisted Craft document properties', () => {
		expect(() => craftDocumentShapeValidator.validate({
			documentID: 'craft-document-id',
			h: 150,
			linkID: 'board-link-id',
			schemaVersion: 1,
			title: 'Study notes',
			w: 320,
		})).not.toThrow()
	})

	it('accepts bounded block edits and rejects duplicate block IDs', () => {
		expect(craftDocumentBlocksUpdateInputSchema.safeParse({
			linkID: '4eb2ef90-7cd7-4b10-a268-66e5fd70f483',
			blocks: [{ id: 'block-1', markdown: 'Updated text' }],
		}).success).toBe(true)
		expect(craftDocumentBlocksUpdateInputSchema.safeParse({
			linkID: '4eb2ef90-7cd7-4b10-a268-66e5fd70f483',
			blocks: [
				{ id: 'block-1', markdown: 'First update' },
				{ id: 'block-1', markdown: 'Second update' },
			],
		}).success).toBe(false)
	})

	it('accepts bounded whiteboard saves and rejects duplicate element IDs', () => {
		expect(craftWhiteboardSaveInputSchema.safeParse({
			elementIDsToDelete: ['old-element'],
			elementsToAdd: [{ id: 'new-element', type: 'rectangle', x: 0, y: 0 }],
			elementsToUpdate: [{ id: 'kept-element', type: 'ellipse', x: 10, y: 20 }],
			expectedRevision: 'a'.repeat(64),
		}).success).toBe(true)
		expect(craftWhiteboardSaveInputSchema.safeParse({
			elementIDsToDelete: ['old-element', 'old-element'],
			elementsToAdd: [],
			elementsToUpdate: [],
			expectedRevision: 'a'.repeat(64),
		}).success).toBe(false)
		expect(craftWhiteboardSaveInputSchema.safeParse({
			elementIDsToDelete: ['same-element'],
			elementsToAdd: [],
			elementsToUpdate: [{ id: 'same-element', type: 'rectangle' }],
			expectedRevision: 'a'.repeat(64),
		}).success).toBe(false)
	})

	it('creates stable revisions for whiteboard element objects', async () => {
		const first = await createCraftWhiteboardRevision([{
			height: 20,
			id: 'element-1',
			type: 'rectangle',
			width: 40,
		}])
		const reordered = await createCraftWhiteboardRevision([{
			width: 40,
			type: 'rectangle',
			id: 'element-1',
			height: 20,
		}])
		const changed = await createCraftWhiteboardRevision([{
			height: 20,
			id: 'element-1',
			type: 'rectangle',
			width: 41,
		}])

		expect(first).toMatch(/^[a-f0-9]{64}$/)
		expect(reordered).toBe(first)
		expect(changed).not.toBe(first)
	})
})
