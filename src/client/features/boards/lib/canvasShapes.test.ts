import {
	createTLSchemaFromUtils,
	type IndexKey,
	type TLPageId,
	type TLRecord,
	type TLShapeId,
	type TLUnknownShape,
} from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	ConceptMapShapeUtil,
	FlashcardShapeUtil,
	PDFPageShapeUtil,
	QuizShapeUtil,
	ReviewShapeUtil,
	WalkthroughShapeUtil,
} from '../../study/shapes/studyShapeUtils'
import { CraftDocumentShapeUtil } from '../../craft/shapes/CraftDocumentShapeUtil'
import { MathShapeUtil } from '../shapes/MathShapeUtil'
import { synchronizedShapeUtils } from './canvasShapes'

describe('synchronizedShapeUtils', () => {
	it('creates a schema with built-in, study, and equation shape migrations', () => {
		expect(() => createTLSchemaFromUtils({ shapeUtils: synchronizedShapeUtils })).not.toThrow()
		expect(synchronizedShapeUtils).toEqual(
			expect.arrayContaining([
				ConceptMapShapeUtil,
				CraftDocumentShapeUtil,
				FlashcardShapeUtil,
				QuizShapeUtil,
				PDFPageShapeUtil,
				ReviewShapeUtil,
				WalkthroughShapeUtil,
				MathShapeUtil,
			])
		)
	})

	it('migrates legacy flashcards before property validation', () => {
		const schema = createTLSchemaFromUtils({ shapeUtils: synchronizedShapeUtils })
		const legacySchema = structuredClone(schema.serialize())
		if (legacySchema.schemaVersion !== 2) throw new Error('Expected the current schema format')
		delete legacySchema.sequences['com.tldraw.shape.agentboard-flashcard']
		const legacyShape: TLUnknownShape = {
			id: 'shape:legacy-flashcard' as TLShapeId,
			index: 'a1' as IndexKey,
			isLocked: false,
			meta: {},
			opacity: 1,
			parentId: 'page:test' as TLPageId,
			props: {
				back: 'Answer',
				front: 'Question',
				h: 190,
				revealed: false,
				schemaVersion: 1,
				w: 300,
			},
			rotation: 0,
			type: 'agentboard-flashcard',
			typeName: 'shape',
			x: 0,
			y: 0,
		}

		const result = schema.migratePersistedRecord(legacyShape as TLRecord, legacySchema)

		expect(result.type).toBe('success')
		if (result.type !== 'success' || result.value.typeName !== 'shape') return
		expect(Reflect.get(result.value.props, 'alternateAnswers')).toEqual([])
		expect(() => schema.types.shape.validator.validate(result.value)).not.toThrow()
	})
})
