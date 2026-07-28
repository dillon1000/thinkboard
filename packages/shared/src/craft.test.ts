import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import {
	craftDocumentBlocksUpdateInputSchema,
	craftDocumentShapeValidator,
	craftShapeSchemas,
	craftWhiteboardSaveInputSchema,
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
			elements: [{ id: 'new-element', type: 'rectangle', x: 0, y: 0 }],
		}).success).toBe(true)
		expect(craftWhiteboardSaveInputSchema.safeParse({
			elementIDsToDelete: ['old-element', 'old-element'],
			elements: [],
		}).success).toBe(false)
	})
})
