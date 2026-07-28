import {
	MAX_CRAFT_WHITEBOARD_ELEMENTS,
	craftAPIRoutes,
	type CraftWhiteboardElement,
	type CraftWhiteboardImport,
	type CraftWhiteboardSaveOutput,
} from '@agentboard/shared'
import {
	Box,
	b64Vecs,
	createShapeId,
	putExcalidrawContent,
	renderPlaintextFromRichText,
	type Editor,
	type JsonObject,
	type TLArrowShape,
	type TLDrawShape,
	type TLFrameShape,
	type TLGeoShape,
	type TLLineShape,
	type TLNoteShape,
	type TLShape,
	type TLShapeId,
	type TLTextShape,
} from 'tldraw'
import { apiRequest } from '../../../lib/api'

const CRAFT_WHITEBOARD_META_KEY = 'agentboardCraftWhiteboard'
const CRAFT_WHITEBOARD_FRAME_PADDING = 48
const IMPORTABLE_EXCALIDRAW_TYPES = new Set([
	'arrow',
	'diamond',
	'ellipse',
	'freedraw',
	'image',
	'line',
	'rectangle',
	'text',
])
const SAVABLE_EXCALIDRAW_TYPES = new Set([
	'arrow',
	'diamond',
	'ellipse',
	'freedraw',
	'line',
	'rectangle',
	'text',
])

interface CraftWhiteboardFrameMetadata {
	documentID: string
	framePadding: number
	schemaVersion: number
	sourceElementIDs: string[]
	sourceOriginX: number
	sourceOriginY: number
	title: string
	whiteboardBlockID: string
}

export interface ImportedCraftWhiteboard extends CraftWhiteboardFrameMetadata {
	frameID: TLShapeId
}

/**
 * Imports Craft's Excalidraw payload through tldraw's native converter, then places the editable
 * shapes in a named frame. The frame records only the source IDs that AgentBoard can save safely.
 */
export async function importCraftWhiteboard(
	editor: Editor,
	boardID: string,
	documentID: string,
	whiteboardBlockID: string
) {
	const existing = listImportedCraftWhiteboards(editor).find((item) =>
		item.documentID === documentID &&
		item.whiteboardBlockID === whiteboardBlockID
	)
	if (existing) {
		editor.select(existing.frameID)
		editor.zoomToSelection()
		return existing
	}

	const source = await apiRequest<CraftWhiteboardImport>(
		craftAPIRoutes.boardWhiteboard(boardID, documentID, whiteboardBlockID)
	)
	const elements = normalizeImportElements(source)
	if (!elements.length) {
		throw new Error('This Craft whiteboard has no elements that AgentBoard can import.')
	}

	const previousShapeIDs = new Set(editor.getCurrentPageShapeIds())
	editor.markHistoryStoppingPoint('import Craft whiteboard')
	await putExcalidrawContent(editor, {
		elements,
		files: source.assets,
	})

	const importedShapes = editor.getCurrentPageShapes().filter(({ id }) =>
		!previousShapeIDs.has(id)
	)
	if (!importedShapes.length) {
		throw new Error('Craft returned whiteboard elements that AgentBoard cannot edit.')
	}
	const rootShapeIDs = editor.getSelectedShapeIds().filter((id) =>
		importedShapes.some((shape) => shape.id === id)
	)
	const bounds = getCommonBounds(editor, importedShapes)
	const sourceOrigin = getSourceOrigin(elements)
	const frameID = createShapeId()
	const metadata: CraftWhiteboardFrameMetadata = {
		documentID,
		framePadding: CRAFT_WHITEBOARD_FRAME_PADDING,
		schemaVersion: 1,
		sourceElementIDs: elements.flatMap(({ id, type }) =>
			SAVABLE_EXCALIDRAW_TYPES.has(type) ? [id] : []
		),
		sourceOriginX: sourceOrigin.x,
		sourceOriginY: sourceOrigin.y,
		title: source.title,
		whiteboardBlockID,
	}

	editor.createShape({
		id: frameID,
		meta: { [CRAFT_WHITEBOARD_META_KEY]: toMetadataJSON(metadata) },
		props: {
			h: Math.max(160, bounds.h + CRAFT_WHITEBOARD_FRAME_PADDING * 2),
			name: `Craft · ${source.title}`,
			w: Math.max(240, bounds.w + CRAFT_WHITEBOARD_FRAME_PADDING * 2),
		},
		type: 'frame',
		x: bounds.x - CRAFT_WHITEBOARD_FRAME_PADDING,
		y: bounds.y - CRAFT_WHITEBOARD_FRAME_PADDING,
	})
	if (rootShapeIDs.length) editor.reparentShapes(rootShapeIDs, frameID)
	editor.select(frameID)
	editor.zoomToSelection()
	return { ...metadata, frameID }
}

/**
 * Writes the current common shapes inside one imported frame back to Craft. AgentBoard sends the
 * new snapshot first; the Worker removes the prior supported IDs only after Craft accepts it.
 */
export async function saveCraftWhiteboard(
	editor: Editor,
	boardID: string,
	frameID: TLShapeId
) {
	const frame = editor.getShape<TLFrameShape>(frameID)
	const metadata = frame ? readCraftWhiteboardMetadata(frame.meta) : null
	if (!frame || frame.type !== 'frame' || !metadata) {
		throw new Error('Select an imported Craft whiteboard before saving.')
	}

	const elements = serializeFrameElements(editor, frame, metadata)
	if (elements.length > MAX_CRAFT_WHITEBOARD_ELEMENTS) {
		throw new Error(
			`Craft whiteboards can save up to ${MAX_CRAFT_WHITEBOARD_ELEMENTS} editable elements.`
		)
	}
	if (!elements.length && !metadata.sourceElementIDs.length) {
		return { added: 0, deleted: 0 } satisfies CraftWhiteboardSaveOutput
	}

	const output = await apiRequest<CraftWhiteboardSaveOutput>(
		craftAPIRoutes.boardWhiteboard(
			boardID,
			metadata.documentID,
			metadata.whiteboardBlockID
		),
		{
			body: JSON.stringify({
				elementIDsToDelete: metadata.sourceElementIDs,
				elements,
			}),
			method: 'PUT',
		}
	)
	editor.updateShape({
		id: frameID,
		meta: {
			...frame.meta,
			[CRAFT_WHITEBOARD_META_KEY]: toMetadataJSON({
				...metadata,
				sourceElementIDs: elements.map(({ id }) => id),
			}),
		},
		type: 'frame',
	})
	return output
}

export function listImportedCraftWhiteboards(editor: Editor): ImportedCraftWhiteboard[] {
	return editor.getCurrentPageShapes().flatMap((shape): ImportedCraftWhiteboard[] => {
		if (shape.type !== 'frame') return []
		const metadata = readCraftWhiteboardMetadata(shape.meta)
		return metadata ? [{ ...metadata, frameID: shape.id }] : []
	})
}

function normalizeImportElements(source: CraftWhiteboardImport) {
	const assets = source.assets
	const elements = source.elements.flatMap((element): CraftWhiteboardElement[] => {
		if (!IMPORTABLE_EXCALIDRAW_TYPES.has(element.type)) return []
		if (
			['arrow', 'freedraw', 'line'].includes(element.type) &&
			(!Array.isArray(element.points) || element.points.length < 2)
		) return []
		if (
			element.type === 'image' &&
			(typeof element.fileId !== 'string' || !readRecord(assets[element.fileId]))
		) return []
		return [{
			angle: 0,
			backgroundColor: 'transparent',
			boundElements: null,
			fillStyle: 'solid',
			groupIds: [],
			height: 0,
			locked: false,
			opacity: 100,
			points: [],
			roughness: 1,
			strokeColor: '#1b1b1f',
			strokeStyle: 'solid',
			strokeWidth: 2,
			width: 0,
			x: 0,
			y: 0,
			...element,
		}]
	})
	const groupCounts = new Map<string, number>()
	for (const element of elements) {
		const groupID = Array.isArray(element.groupIds) && typeof element.groupIds[0] === 'string'
			? element.groupIds[0]
			: null
		if (groupID) groupCounts.set(groupID, (groupCounts.get(groupID) ?? 0) + 1)
	}
	return elements.map((element) => {
		const groupID = Array.isArray(element.groupIds) && typeof element.groupIds[0] === 'string'
			? element.groupIds[0]
			: null
		return groupID && groupCounts.get(groupID) === 1
			? { ...element, groupIds: [] }
			: element
	})
}

function serializeFrameElements(
	editor: Editor,
	frame: TLFrameShape,
	metadata: CraftWhiteboardFrameMetadata
) {
	const frameOrigin = editor.getShapePageTransform(frame)?.applyToPoint({ x: 0, y: 0 })
	if (!frameOrigin) throw new Error('The Craft whiteboard frame is not available.')
	const descendantIDs = editor.getShapeAndDescendantIds([frame.id])
	const shapes = [...descendantIDs].flatMap((id): TLShape[] => {
		const shape = editor.getShape(id)
		return shape && shape.id !== frame.id && shape.type !== 'group' ? [shape] : []
	})
	return shapes.flatMap((shape) => serializeShape(
		editor,
		shape,
		frameOrigin,
		metadata
	))
}

function serializeShape(
	editor: Editor,
	shape: TLShape,
	frameOrigin: { x: number; y: number },
	metadata: CraftWhiteboardFrameMetadata
): CraftWhiteboardElement[] {
	const transform = editor.getShapePageTransform(shape)
	const bounds = editor.getShapePageBounds(shape)
	if (!transform || !bounds) return []
	const pageOrigin = transform.applyToPoint({ x: 0, y: 0 })
	const position = {
		x: metadata.sourceOriginX + pageOrigin.x - frameOrigin.x - metadata.framePadding,
		y: metadata.sourceOriginY + pageOrigin.y - frameOrigin.y - metadata.framePadding,
	}
	const angle = transform.rotation()

	switch (shape.type) {
		case 'geo':
			return serializeGeo(editor, shape as TLGeoShape, position, angle)
		case 'text':
			return [createTextElement(
				renderPlaintextFromRichText(editor, (shape as TLTextShape).props.richText),
				position.x,
				position.y,
				Math.max(1, bounds.w),
				Math.max(1, bounds.h),
				shape,
				angle
			)]
		case 'note':
			return serializeNote(editor, shape as TLNoteShape, position, bounds.w, bounds.h, angle)
		case 'arrow':
			return serializeArrow(editor, shape as TLArrowShape, position, angle)
		case 'line':
			return [serializeLine(shape as TLLineShape, position, angle)]
		case 'draw':
			return serializeDraw(shape as TLDrawShape, position, angle)
		default:
			return []
	}
}

function serializeGeo(
	editor: Editor,
	shape: TLGeoShape,
	position: { x: number; y: number },
	angle: number
) {
	const id = createElementID()
	const text = renderPlaintextFromRichText(editor, shape.props.richText)
	const labelID = text ? createElementID() : null
	const type = shape.props.geo === 'ellipse' || shape.props.geo === 'diamond'
		? shape.props.geo
		: 'rectangle'
	const width = Math.max(1, shape.props.w * shape.props.scale)
	const height = Math.max(1, shape.props.h * shape.props.scale)
	const element = {
		...createElementBase(id, type, position.x, position.y, width, height, shape, angle),
		backgroundColor: shape.props.fill === 'none'
			? 'transparent'
			: getExcalidrawColor(shape.props.color),
		boundElements: labelID ? [{ id: labelID, type: 'text' }] : null,
		fillStyle: shape.props.fill === 'pattern' ? 'hachure' : 'solid',
		link: shape.props.url || null,
		roundness: type === 'rectangle' ? { type: 3 } : null,
		strokeColor: getExcalidrawColor(shape.props.color),
		strokeStyle: getExcalidrawStrokeStyle(shape.props.dash),
		strokeWidth: getExcalidrawStrokeWidth(shape.props.size),
	}
	if (!labelID) return [element]
	return [
		element,
		createTextElement(
			text,
			position.x + 8,
			position.y + Math.max(8, height / 2 - 12),
			Math.max(1, width - 16),
			24,
			shape,
			angle,
			labelID,
			id
		),
	]
}

function serializeNote(
	editor: Editor,
	shape: TLNoteShape,
	position: { x: number; y: number },
	width: number,
	height: number,
	angle: number
) {
	const id = createElementID()
	const labelID = createElementID()
	return [{
		...createElementBase(id, 'rectangle', position.x, position.y, width, height, shape, angle),
		backgroundColor: getExcalidrawColor(shape.props.color),
		boundElements: [{ id: labelID, type: 'text' }],
		fillStyle: 'solid',
		roundness: { type: 3 },
		strokeColor: getExcalidrawColor(shape.props.color),
	}, createTextElement(
		renderPlaintextFromRichText(editor, shape.props.richText),
		position.x + 12,
		position.y + 12,
		Math.max(1, width - 24),
		Math.max(1, height - 24),
		shape,
		angle,
		labelID,
		id
	)]
}

function serializeArrow(
	editor: Editor,
	shape: TLArrowShape,
	position: { x: number; y: number },
	angle: number
) {
	const points = normalizePoints([shape.props.start, shape.props.end])
	const id = createElementID()
	const text = renderPlaintextFromRichText(editor, shape.props.richText)
	const element = {
		...createLinearElementBase(id, 'arrow', position, points, shape, angle),
		endArrowhead: getExcalidrawArrowhead(shape.props.arrowheadEnd),
		startArrowhead: getExcalidrawArrowhead(shape.props.arrowheadStart),
	}
	if (!text) return [element]
	return [
		element,
		createTextElement(
			text,
			position.x + element.width / 2 - 60,
			position.y + element.height / 2 - 12,
			120,
			24,
			shape,
			angle
		),
	]
}

function serializeLine(
	shape: TLLineShape,
	position: { x: number; y: number },
	angle: number
) {
	const points = normalizePoints(
		Object.values(shape.props.points)
			.sort((left, right) => left.index.localeCompare(right.index))
	)
	return {
		...createLinearElementBase(
			createElementID(),
			'line',
			position,
			points,
			shape,
			angle
		),
		endArrowhead: null,
		startArrowhead: null,
	}
}

function serializeDraw(
	shape: TLDrawShape,
	position: { x: number; y: number },
	angle: number
) {
	const decodedPoints = shape.props.segments.flatMap((segment) =>
		b64Vecs.decodePoints(segment.path).map(({ x, y, z }) => ({
			x: x * shape.props.scale * shape.props.scaleX,
			y: y * shape.props.scale * shape.props.scaleY,
			z,
		}))
	)
	if (decodedPoints.length < 2) return []
	const points = normalizePoints(decodedPoints)
	const base = createLinearElementBase(
		createElementID(),
		'freedraw',
		position,
		points,
		shape,
		angle
	)
	return [{
		...base,
		endBinding: null,
		lastCommittedPoint: null,
		pressures: decodedPoints.map(({ z }) => z ?? .5),
		simulatePressure: !shape.props.isPen,
		startBinding: null,
	}]
}

function createLinearElementBase(
	id: string,
	type: 'arrow' | 'freedraw' | 'line',
	position: { x: number; y: number },
	points: number[][],
	shape: TLShape,
	angle: number
) {
	const xs = points.map(([x]) => x)
	const ys = points.map(([, y]) => y)
	return {
		...createElementBase(
			id,
			type,
			position.x,
			position.y,
			Math.max(1, Math.max(...xs) - Math.min(...xs)),
			Math.max(1, Math.max(...ys) - Math.min(...ys)),
			shape,
			angle
		),
		backgroundColor: 'transparent',
		boundElements: null,
		fillStyle: 'solid',
		points,
		roundness: null,
		strokeColor: getShapeColor(shape),
		strokeStyle: getShapeDash(shape),
		strokeWidth: getShapeStrokeWidth(shape),
	}
}

function createTextElement(
	text: string,
	x: number,
	y: number,
	width: number,
	height: number,
	shape: TLShape,
	angle: number,
	id = createElementID(),
	containerId: string | null = null
) {
	return {
		...createElementBase(id, 'text', x, y, width, height, shape, angle),
		autoResize: true,
		backgroundColor: 'transparent',
		boundElements: null,
		containerId,
		fontFamily: getShapeFont(shape) === 'mono' ? 3 : 2,
		fontSize: getShapeFontSize(shape),
		lineHeight: 1.25,
		originalText: text,
		roundness: null,
		strokeColor: getShapeColor(shape),
		text,
		textAlign: getShapeTextAlign(shape),
		verticalAlign: 'middle',
	}
}

function createElementBase(
	id: string,
	type: string,
	x: number,
	y: number,
	width: number,
	height: number,
	shape: TLShape,
	angle: number
) {
	return {
		angle,
		backgroundColor: 'transparent',
		boundElements: null,
		fillStyle: 'solid',
		groupIds: [],
		height,
		id,
		isDeleted: false,
		link: null,
		locked: shape.isLocked,
		opacity: Math.round(shape.opacity * 100),
		roughness: 0,
		seed: createSeed(),
		strokeColor: getShapeColor(shape),
		strokeStyle: getShapeDash(shape),
		strokeWidth: getShapeStrokeWidth(shape),
		type,
		updated: Date.now(),
		version: 1,
		versionNonce: createSeed(),
		width,
		x,
		y,
	}
}

function getCommonBounds(editor: Editor, shapes: readonly TLShape[]) {
	const bounds = shapes.flatMap((shape) => {
		const value = editor.getShapePageBounds(shape)
		return value ? [value] : []
	})
	if (!bounds.length) throw new Error('Unable to place the imported Craft whiteboard.')
	return Box.Common(bounds)
}

function getSourceOrigin(elements: readonly CraftWhiteboardElement[]) {
	const positions = elements.flatMap((element) =>
		typeof element.x === 'number' && typeof element.y === 'number'
			? [{ x: element.x, y: element.y }]
			: []
	)
	return {
		x: positions.length ? Math.min(...positions.map(({ x }) => x)) : 0,
		y: positions.length ? Math.min(...positions.map(({ y }) => y)) : 0,
	}
}

function readCraftWhiteboardMetadata(meta: JsonObject): CraftWhiteboardFrameMetadata | null {
	const record = readRecord(meta[CRAFT_WHITEBOARD_META_KEY])
	const documentID = readString(record, 'documentID')
	const whiteboardBlockID = readString(record, 'whiteboardBlockID')
	const title = readString(record, 'title')
	const framePadding = readNumber(record, 'framePadding')
	const sourceOriginX = readNumber(record, 'sourceOriginX')
	const sourceOriginY = readNumber(record, 'sourceOriginY')
	const sourceElementIDs = record?.sourceElementIDs
	if (
		!documentID ||
		!whiteboardBlockID ||
		!title ||
		framePadding === null ||
		sourceOriginX === null ||
		sourceOriginY === null ||
		!Array.isArray(sourceElementIDs) ||
		!sourceElementIDs.every((value) => typeof value === 'string')
	) return null
	return {
		documentID,
		framePadding,
		schemaVersion: readNumber(record, 'schemaVersion') ?? 1,
		sourceElementIDs,
		sourceOriginX,
		sourceOriginY,
		title,
		whiteboardBlockID,
	}
}

function toMetadataJSON(metadata: CraftWhiteboardFrameMetadata): JsonObject {
	return {
		documentID: metadata.documentID,
		framePadding: metadata.framePadding,
		schemaVersion: metadata.schemaVersion,
		sourceElementIDs: metadata.sourceElementIDs,
		sourceOriginX: metadata.sourceOriginX,
		sourceOriginY: metadata.sourceOriginY,
		title: metadata.title,
		whiteboardBlockID: metadata.whiteboardBlockID,
	}
}

function normalizePoints(points: readonly { x: number; y: number }[]) {
	const first = points[0] ?? { x: 0, y: 0 }
	return points.map(({ x, y }) => [x - first.x, y - first.y])
}

function getShapeColor(shape: TLShape) {
	if ('color' in shape.props && typeof shape.props.color === 'string') {
		return getExcalidrawColor(shape.props.color)
	}
	return '#1b1b1f'
}

function getShapeDash(shape: TLShape) {
	if ('dash' in shape.props && typeof shape.props.dash === 'string') {
		return getExcalidrawStrokeStyle(shape.props.dash)
	}
	return 'solid'
}

function getShapeStrokeWidth(shape: TLShape) {
	if ('size' in shape.props && typeof shape.props.size === 'string') {
		return getExcalidrawStrokeWidth(shape.props.size)
	}
	return 2
}

function getShapeFont(shape: TLShape) {
	return 'font' in shape.props && typeof shape.props.font === 'string'
		? shape.props.font
		: 'sans'
}

function getShapeFontSize(shape: TLShape) {
	if (!('size' in shape.props) || typeof shape.props.size !== 'string') return 20
	return { l: 28, m: 20, s: 16, xl: 36 }[shape.props.size] ?? 20
}

function getShapeTextAlign(shape: TLShape) {
	const value = 'textAlign' in shape.props
		? shape.props.textAlign
		: 'align' in shape.props
			? shape.props.align
			: 'middle'
	if (value === 'start') return 'left'
	if (value === 'end') return 'right'
	return 'center'
}

function getExcalidrawStrokeStyle(value: string) {
	if (value === 'dashed' || value === 'dotted') return value
	return 'solid'
}

function getExcalidrawStrokeWidth(value: string) {
	return { l: 3, m: 2, s: 1, xl: 4 }[value] ?? 2
}

function getExcalidrawArrowhead(value: string) {
	return {
		arrow: 'arrow',
		dot: 'dot',
		pipe: 'bar',
		triangle: 'triangle',
	}[value] ?? null
}

function getExcalidrawColor(value: string) {
	return {
		black: '#1b1b1f',
		blue: '#1971c2',
		green: '#2f9e44',
		grey: '#868e96',
		'light-blue': '#a5d8ff',
		'light-green': '#b2f2bb',
		'light-red': '#ffc9c9',
		'light-violet': '#d0bfff',
		orange: '#f08c00',
		red: '#e03131',
		violet: '#6741d9',
		white: '#ffffff',
		yellow: '#ffd43b',
	}[value] ?? '#1b1b1f'
}

function createElementID() {
	return crypto.randomUUID().replaceAll('-', '').slice(0, 20)
}

function createSeed() {
	return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null
}

function readString(record: Record<string, unknown> | null, key: string) {
	const value = record?.[key]
	return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(record: Record<string, unknown> | null, key: string) {
	const value = record?.[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}
