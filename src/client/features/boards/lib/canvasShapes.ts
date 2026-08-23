import { defaultShapeUtils } from 'tldraw'
import { CraftDocumentShapeUtil } from '../../craft/shapes/CraftDocumentShapeUtil'
import { studyShapeUtils } from '../../study/shapes/studyShapeUtils'
import { MathShapeUtil } from '../shapes/MathShapeUtil'
import { NotePageShapeUtil } from './pageNoteMode'

/** Everything the board can draw: tldraw's own shapes, the tutor's study shapes, and equations. */
export const canvasShapeUtils = [
	...studyShapeUtils,
	CraftDocumentShapeUtil,
	MathShapeUtil,
	NotePageShapeUtil,
] as const

/**
 * The store speaks the full schema — the sync client validates every shape arriving from another
 * person on the board, including the built-in ones the editor already knows about.
 */
export const synchronizedShapeUtils = [...defaultShapeUtils, ...canvasShapeUtils] as const
