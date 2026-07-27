import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import {
	craftDocumentShapeValidator,
	craftShapeSchemas,
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
})
