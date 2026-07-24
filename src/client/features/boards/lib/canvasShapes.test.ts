import { createTLSchemaFromUtils } from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	ConceptMapShapeUtil,
	FlashcardShapeUtil,
	PDFPageShapeUtil,
	QuizShapeUtil,
	ReviewShapeUtil,
	WalkthroughShapeUtil,
} from '../../study/shapes/studyShapeUtils'
import { MathShapeUtil } from '../shapes/MathShapeUtil'
import { synchronizedShapeUtils } from './canvasShapes'

describe('synchronizedShapeUtils', () => {
	it('creates a schema with built-in, study, and equation shape migrations', () => {
		expect(() => createTLSchemaFromUtils({ shapeUtils: synchronizedShapeUtils })).not.toThrow()
		expect(synchronizedShapeUtils).toEqual(
			expect.arrayContaining([
				ConceptMapShapeUtil,
				FlashcardShapeUtil,
				QuizShapeUtil,
				PDFPageShapeUtil,
				ReviewShapeUtil,
				WalkthroughShapeUtil,
				MathShapeUtil,
			])
		)
	})
})
