import {
	MAX_CANVAS_SELECTION_IMAGE_DATA_LENGTH,
	MAX_PDF_PAGES,
	PDF_PAGE_SHAPE_TYPE,
	apiRoutes,
	type CanvasContext,
	type CanvasShape,
	type CanvasShapeRelationship,
} from '@agentboard/shared'
import {
	Editor,
	isShapeId,
	renderHtmlFromRichText,
	type TLBinding,
	type TLRichText,
	type TLShape,
	type TLShapeId,
} from 'tldraw'
import { apiRequest } from '../../../lib/api'
import { capturePDFTextSelection } from './pdfTextSelection'

const MAX_SELECTION_SHAPES = 30
const MAX_VIEWPORT_SHAPES = 40
const MAX_RELATED_SHAPES = 30
const MAX_RELATIONSHIPS = 60

export async function captureCanvasContext(
	boardID: string,
	editor: Editor | null
): Promise<CanvasContext> {
	const pdfTextSelection = capturePDFTextSelection()
	if (!editor) {
		return {
			boardID,
			documentClock: await getDocumentClock(boardID),
			relatedShapes: [],
			relationships: [],
			selection: [],
			...(pdfTextSelection ? { pdfTextSelection } : {}),
		}
	}

	const viewportBounds = editor.getViewportPageBounds()
	const selectedShapes = editor.getSelectedShapes().slice(0, MAX_SELECTION_SHAPES)
	const selectedShapeIDs = new Set(selectedShapes.map(({ id }) => id))
	const visibleShapes = editor.getCurrentPageShapesSorted()
		.filter((shape) => !selectedShapeIDs.has(shape.id) && isShapeVisible(editor, shape, viewportBounds))
		.slice(-MAX_VIEWPORT_SHAPES)
	const contextShapes = [...selectedShapes, ...visibleShapes]
	const relationships = extractRelationships(editor, contextShapes)
	const contextShapeIDs = new Set(contextShapes.map(({ id }) => id))
	const relatedShapes = getRelatedShapes(editor, relationships, contextShapeIDs)
	const documentClockPromise = getDocumentClock(boardID)
	const pdfPageRegions = getOverlappingPDFPageRegions(editor, selectedShapes)
	const [documentClock, selectionImage] = await Promise.all([
		documentClockPromise,
		isSinglePDFFrameSelection(editor, selectedShapes)
			? Promise.resolve(undefined)
			: renderSelectionImage(editor, selectedShapes.map(({ id }) => id)),
	])

	return {
		boardID,
		documentClock,
		pageID: editor.getCurrentPageId(),
		viewport: {
			x: viewportBounds.x,
			y: viewportBounds.y,
			w: viewportBounds.w,
			h: viewportBounds.h,
			zoom: editor.getZoomLevel(),
			shapes: visibleShapes.map((shape) => extractShape(editor, shape)),
		},
		selection: selectedShapes.map((shape) => extractShape(editor, shape)),
		relatedShapes: relatedShapes.map((shape) => extractShape(editor, shape)),
		relationships,
		selectionImage,
		...(pdfPageRegions.length ? { pdfPageRegions } : {}),
		...(pdfTextSelection ? { pdfTextSelection } : {}),
	}
}

export function isSinglePDFFrameSelection(
	editor: Editor,
	selectedShapes: readonly TLShape[]
) {
	const frame = selectedShapes.length === 1 ? selectedShapes[0] : undefined
	if (frame?.type !== 'frame') return false
	return editor
		.getSortedChildIdsForParent(frame.id)
		.some((shapeID) => editor.getShape(shapeID)?.type === PDF_PAGE_SHAPE_TYPE)
}

export function getOverlappingPDFPageRegions(
	editor: Editor,
	selectedShapes: readonly TLShape[]
) {
	if (!selectedShapes.length) return []
	const selectionBounds = editor.getSelectionPageBounds()
	if (!selectionBounds) return []
	return editor.getCurrentPageShapesSorted().flatMap((shape) => {
		if (shape.type !== PDF_PAGE_SHAPE_TYPE) return []
		const bounds = editor.getShapePageBounds(shape)
		const documentID = Reflect.get(shape.props, 'documentId')
		const pageNumber = Reflect.get(shape.props, 'pageNumber')
		if (!bounds || typeof documentID !== 'string' || typeof pageNumber !== 'number') return []
		const intersection = intersectRectangles(selectionBounds, bounds)
		if (!intersection) return []
		return [{
			documentID,
			pageNumber,
			region: {
				h: clampUnit(intersection.h / bounds.h),
				w: clampUnit(intersection.w / bounds.w),
				x: clampUnit((intersection.x - bounds.x) / bounds.w),
				y: clampUnit((intersection.y - bounds.y) / bounds.h),
			},
			shapeID: shape.id,
		}]
	}).slice(0, MAX_PDF_PAGES)
}

function intersectRectangles(
	a: { h: number; w: number; x: number; y: number },
	b: { h: number; w: number; x: number; y: number }
) {
	const x = Math.max(a.x, b.x)
	const y = Math.max(a.y, b.y)
	const right = Math.min(a.x + a.w, b.x + b.w)
	const bottom = Math.min(a.y + a.h, b.y + b.h)
	return right > x && bottom > y ? { h: bottom - y, w: right - x, x, y } : null
}

function clampUnit(value: number) {
	return Math.max(0, Math.min(1, value))
}

function extractShape(editor: Editor, shape: TLShape): CanvasShape {
	const bounds = editor.getShapePageBounds(shape)
	const plainText = (editor.getShapeUtil(shape).getText(shape) ?? '').trim().slice(0, 2_000)
	const richText = getRichText(shape)
	const html = richText
		? renderHtmlFromRichText(editor, richText).trim().slice(0, 4_000)
		: undefined
	const style = extractShapeStyle(shape)

	return {
		id: shape.id,
		type: shape.type,
		...(isShapeId(shape.parentId) ? { parentShapeID: shape.parentId } : {}),
		childShapeIDs: editor.getSortedChildIdsForParent(shape.id).slice(0, MAX_RELATED_SHAPES),
		index: shape.index,
		isLocked: shape.isLocked,
		opacity: shape.opacity,
		x: bounds?.x ?? shape.x,
		y: bounds?.y ?? shape.y,
		w: bounds?.w ?? 0,
		h: bounds?.h ?? 0,
		rotation: editor.getShapePageTransform(shape)?.rotation() ?? shape.rotation,
		...(style ? { style } : {}),
		...(plainText || html ? {
			text: {
				plainText,
				...(html ? { html } : {}),
			},
		} : {}),
	}
}

function extractShapeStyle(shape: TLShape) {
	const keys = [
		'color',
		'labelColor',
		'fill',
		'dash',
		'size',
		'font',
		'textAlign',
		'verticalAlign',
		'geo',
		'spline',
		'arrowheadStart',
		'arrowheadEnd',
	] as const
	const entries = keys.flatMap((key) => {
		const value = Reflect.get(shape.props, key)
		return typeof value === 'string' ? [[key, value] as const] : []
	})
	return entries.length ? Object.fromEntries(entries) : undefined
}

function getRichText(shape: TLShape): TLRichText | undefined {
	const value = Reflect.get(shape.props, 'richText')
	if (!value || typeof value !== 'object') return undefined
	if (Reflect.get(value, 'type') !== 'doc' || !Array.isArray(Reflect.get(value, 'content'))) {
		return undefined
	}
	return value as TLRichText
}

function extractRelationships(editor: Editor, shapes: readonly TLShape[]) {
	const bindings = new Map<string, TLBinding>()
	for (const shape of shapes) {
		for (const binding of editor.getBindingsInvolvingShape(shape)) {
			bindings.set(binding.id, binding)
		}
	}

	return [...bindings.values()]
		.slice(0, MAX_RELATIONSHIPS)
		.map((binding): CanvasShapeRelationship => {
			const terminal = Reflect.get(binding.props, 'terminal')
			const normalizedAnchor = Reflect.get(binding.props, 'normalizedAnchor')
			return {
				bindingID: binding.id,
				type: binding.type,
				connectorShapeID: binding.fromId,
				targetShapeID: binding.toId,
				...(terminal === 'start' || terminal === 'end' ? { terminal } : {}),
				...(isPoint(normalizedAnchor) ? {
					anchor: { x: normalizedAnchor.x, y: normalizedAnchor.y },
				} : {}),
			}
		})
}

function getRelatedShapes(
	editor: Editor,
	relationships: readonly CanvasShapeRelationship[],
	contextShapeIDs: ReadonlySet<TLShapeId>
) {
	const relatedShapeIDs = new Set<TLShapeId>()
	for (const relationship of relationships) {
		for (const shapeID of [relationship.connectorShapeID, relationship.targetShapeID]) {
			if (isShapeId(shapeID) && !contextShapeIDs.has(shapeID)) relatedShapeIDs.add(shapeID)
		}
	}
	return [...relatedShapeIDs]
		.slice(0, MAX_RELATED_SHAPES)
		.flatMap((shapeID) => {
			const shape = editor.getShape(shapeID)
			return shape ? [shape] : []
		})
}

function isShapeVisible(
	editor: Editor,
	shape: TLShape,
	viewport: { x: number; y: number; w: number; h: number }
) {
	const bounds = editor.getShapePageBounds(shape)
	if (!bounds) return false
	return bounds.x <= viewport.x + viewport.w &&
		bounds.x + bounds.w >= viewport.x &&
		bounds.y <= viewport.y + viewport.h &&
		bounds.y + bounds.h >= viewport.y
}

function isPoint(value: unknown): value is { x: number; y: number } {
	return Boolean(
		value &&
		typeof value === 'object' &&
		typeof Reflect.get(value, 'x') === 'number' &&
		typeof Reflect.get(value, 'y') === 'number'
	)
}

async function getDocumentClock(boardID: string) {
	try {
		const response = await apiRequest<{ documentClock: number }>(apiRoutes.boardContext(boardID))
		return response.documentClock
	} catch {
		return undefined
	}
}

async function renderSelectionImage(editor: Editor, shapeIDs: readonly TLShapeId[]) {
	if (shapeIDs.length === 0) return undefined
	const bounds = editor.getSelectionPageBounds()
	if (!bounds) return undefined

	const paddedMaximumDimension = Math.max(bounds.w, bounds.h) + 64
	const scale = Math.min(2, 1_800 / Math.max(1, paddedMaximumDimension))

	try {
		const image = await editor.toImage([...shapeIDs], {
			background: true,
			darkMode: false,
			format: 'jpeg',
			padding: 32,
			pixelRatio: 1,
			quality: 0.9,
			scale,
		})
		const data = await blobToBase64(image.blob)
		if (data.length > MAX_CANVAS_SELECTION_IMAGE_DATA_LENGTH) return undefined
		return {
			data,
			height: Math.round(image.height),
			mediaType: 'image/jpeg' as const,
			width: Math.round(image.width),
		}
	} catch {
		return undefined
	}
}

async function blobToBase64(blob: Blob) {
	const bytes = new Uint8Array(await blob.arrayBuffer())
	let binary = ''
	for (let offset = 0; offset < bytes.length; offset += 32_768) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
	}
	return btoa(binary)
}
