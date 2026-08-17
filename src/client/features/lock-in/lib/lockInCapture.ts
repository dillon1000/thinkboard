import {
	MAX_LOCK_IN_IMAGE_DATA_LENGTH,
	type LockInReviewImage,
} from '@agentboard/shared'
import type { Editor, TLShapeId } from 'tldraw'

const FULL_CANVAS_MAX_DIMENSION = 1_200
const CHANGES_MAX_DIMENSION = 900
const EXPORT_PADDING = 32

export interface LockInCapture {
	canvasImage: LockInReviewImage
	changedShapeCount: number
	changesImage?: LockInReviewImage
}

export async function captureLockInReviewImages(
	editor: Editor,
	changedShapeIDs: readonly TLShapeId[]
): Promise<LockInCapture> {
	const pageShapeIDs = editor.getCurrentPageShapesSorted().map(({ id }) => id)
	if (pageShapeIDs.length === 0) throw new Error('Add something to the canvas before asking for a review')

	const pageShapeIDSet = new Set(pageShapeIDs)
	const visibleChangedShapeIDs = changedShapeIDs.filter((shapeID) =>
		pageShapeIDSet.has(shapeID) && Boolean(editor.getShape(shapeID))
	)
	const [canvasImage, changesImage] = await Promise.all([
		renderShapeImage(editor, pageShapeIDs, FULL_CANVAS_MAX_DIMENSION),
		visibleChangedShapeIDs.length
			? renderShapeImage(editor, visibleChangedShapeIDs, CHANGES_MAX_DIMENSION)
			: Promise.resolve(undefined),
	])

	return {
		canvasImage,
		changedShapeCount: changedShapeIDs.length,
		...(changesImage && { changesImage }),
	}
}

export function getLockInExportScale(
	bounds: readonly { h: number; w: number; x?: number; y?: number }[],
	maxDimension: number,
	padding = EXPORT_PADDING
) {
	const minX = bounds.length ? Math.min(...bounds.map(({ x = 0 }) => x)) : 0
	const minY = bounds.length ? Math.min(...bounds.map(({ y = 0 }) => y)) : 0
	const maxX = bounds.length ? Math.max(...bounds.map(({ w, x = 0 }) => x + w)) : 1
	const maxY = bounds.length ? Math.max(...bounds.map(({ h, y = 0 }) => y + h)) : 1
	const contentWidth = maxX - minX
	const contentHeight = maxY - minY
	const availableDimension = Math.max(1, maxDimension - padding * 2)
	return Math.min(1, availableDimension / Math.max(1, contentWidth, contentHeight))
}

async function renderShapeImage(
	editor: Editor,
	shapeIDs: readonly TLShapeId[],
	maxDimension: number
): Promise<LockInReviewImage> {
	const bounds = shapeIDs.flatMap((shapeID) => {
		const value = editor.getShapePageBounds(shapeID)
		return value ? [{ h: value.h, w: value.w, x: value.x, y: value.y }] : []
	})
	const result = await editor.toImageDataUrl([...shapeIDs], {
		background: true,
		format: 'jpeg',
		padding: EXPORT_PADDING,
		pixelRatio: 1,
		quality: 0.76,
		scale: getLockInExportScale(bounds, maxDimension),
	})
	const separatorIndex = result.url.indexOf(',')
	const data = separatorIndex >= 0 ? result.url.slice(separatorIndex + 1) : result.url
	if (!data || data.length > MAX_LOCK_IN_IMAGE_DATA_LENGTH) {
		throw new Error('The canvas snapshot is too large to review')
	}
	return {
		data,
		height: Math.min(2_048, Math.max(1, Math.round(result.height))),
		mediaType: 'image/jpeg',
		width: Math.min(2_048, Math.max(1, Math.round(result.width))),
	}
}
