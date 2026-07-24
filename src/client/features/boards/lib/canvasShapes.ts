import { defaultShapeUtils } from 'tldraw'
import { studyShapeUtils } from '../../study/shapes/studyShapeUtils'
import { MathShapeUtil } from '../shapes/MathShapeUtil'

/** Everything the board can draw: tldraw's own shapes, the tutor's study shapes, and equations. */
export const canvasShapeUtils = [...studyShapeUtils, MathShapeUtil] as const

/**
 * The store speaks the full schema — the sync client validates every shape arriving from another
 * person on the board, including the built-in ones the editor already knows about.
 */
export const synchronizedShapeUtils = [...defaultShapeUtils, ...canvasShapeUtils] as const
