import type {
	CraftWhiteboardElement,
	CraftWhiteboardImport,
	CraftWhiteboardRecord,
} from '@agentboard/shared'
import { z } from 'zod'
import {
	AssetRecordType,
	Box,
	createShapeId,
	isShapeId,
	putExcalidrawContent,
	toRichText,
	type Editor,
	type JsonObject,
	type TLDefaultColorStyle,
	type TLDefaultFontStyle,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
	type TLVideoShape,
} from 'tldraw'

export const CRAFT_ELEMENT_META_KEY = 'agentboardCraftElement'
export const CRAFT_GROUP_META_KEY = 'agentboardCraftGroup'
export const CRAFT_BACKGROUND_META_KEY = 'agentboardCraftBackground'

const EXCALIDRAW_NATIVE_TYPES = new Set([
	'arrow',
	'diamond',
	'ellipse',
	'freedraw',
	'line',
	'rectangle',
	'text',
])
const FRAME_TYPES = new Set(['frame', 'magicframe'])
const NOTE_TYPES = new Set(['note', 'sticky', 'sticky-note'])
const EMBED_TYPES = new Set(['embed', 'embeddable'])
const craftRecordSchema = z.record(z.string(), z.json())
const scaleSchema = z.tuple([z.number(), z.number()])

interface CraftElementMetadata {
	elementIDs: string[]
	sourceElements: CraftWhiteboardElement[]
}

export interface NativeCraftWhiteboardContent {
	rootShapeIDs: TLShapeId[]
	shapes: TLShape[]
	sourceElementIDs: string[]
	sourceOrigin: { x: number; y: number }
}

/**
 * Creates editable tldraw shapes for each Craft whiteboard tool that has a native board model.
 * The source element records stay on their shapes so later saves can retain Craft-only fields.
 */
export async function putNativeCraftWhiteboardContent(
	editor: Editor,
	source: CraftWhiteboardImport
): Promise<NativeCraftWhiteboardContent> {
	const sourceOrigin = getSourceOrigin(source.elements)
	const commonElements = normalizeExcalidrawElements(source.elements)
	const beforeIDs = new Set(editor.getCurrentPageShapeIds())

	if (commonElements.length) {
		await putExcalidrawContent(editor, {
			elements: commonElements,
			files: {},
		})
	}

	const commonShapes = editor.getCurrentPageShapes().filter(({ id }) => !beforeIDs.has(id))
	const offset = getImportOffset(editor, commonElements, commonShapes, source.elements)
	attachCommonElementMetadata(editor, source.elements, commonShapes, offset)

	const sourceShapeIDs = new Map<string, TLShapeId>()
	for (const shape of commonShapes) {
		const metadata = readCraftElementMetadata(editor.getShape(shape.id)?.meta ?? {})
		for (const id of metadata?.elementIDs ?? []) sourceShapeIDs.set(id, shape.id)
	}

	for (const element of source.elements) {
		if (
			isBoundText(element, source.elements) ||
			(EXCALIDRAW_NATIVE_TYPES.has(element.type) && !isCraftStickyElement(element))
		) {
			continue
		}
		const shapeID = createSpecialNativeShape(editor, source, element, offset)
		if (shapeID) sourceShapeIDs.set(element.id, shapeID)
	}

	applyCraftGroups(editor, source.elements, sourceShapeIDs)
	applyCraftFrameMembership(editor, source.elements, sourceShapeIDs)
	applyCraftArrowBindings(editor, source.elements, sourceShapeIDs)

	const shapes = editor.getCurrentPageShapes().filter(({ id }) => !beforeIDs.has(id))
	const importedIDs = new Set(shapes.map(({ id }) => id))
	const rootShapeIDs = shapes
		.filter(({ id, parentId }) =>
			importedIDs.has(id) && (!isShapeId(parentId) || !importedIDs.has(parentId))
		)
		.map(({ id }) => id)

	const gridSize = readNumber(readRecord(source.appState), 'gridSize')
	if (gridSize && gridSize > 0) editor.updateInstanceState({ isGridMode: true })

	return {
		rootShapeIDs,
		shapes,
		sourceElementIDs: [...sourceShapeIDs.keys()],
		sourceOrigin,
	}
}

export function readCraftElementMetadata(meta: JsonObject): CraftElementMetadata | null {
	const record = readRecord(meta[CRAFT_ELEMENT_META_KEY])
	const elementIDs = z.array(z.string()).safeParse(record?.elementIDs)
	const sourceElements = record?.sourceElements
	if (
		!elementIDs.success ||
		!Array.isArray(sourceElements)
	) return null

	const elements = sourceElements.flatMap((value): CraftWhiteboardElement[] => {
		const element = readRecord(value)
		const id = readString(element, 'id')
		const type = readString(element, 'type')
		return element && id && type ? [{ ...element, id, type }] : []
	})
	return elements.length === sourceElements.length
		? { elementIDs: elementIDs.data, sourceElements: elements }
		: null
}

export function createCraftElementMeta(
	sourceElements: readonly CraftWhiteboardElement[]
): JsonObject {
	return {
		elementIDs: sourceElements.map(({ id }) => id),
		sourceElements: sourceElements.map(elementToJSON),
	}
}

export function readCraftGroupID(meta: JsonObject) {
	const record = readRecord(meta[CRAFT_GROUP_META_KEY])
	return readString(record, 'groupID')
}

export function isCraftBackgroundShape(shape: TLShape) {
	return shape.meta[CRAFT_BACKGROUND_META_KEY] === true
}

/**
 * Adds a locked native geometry behind the imported content. Craft stores an arbitrary background
 * color, while tldraw uses a named palette, so the closest native palette color is used.
 */
export function addCraftWhiteboardBackground(
	editor: Editor,
	frameID: TLShapeId,
	frameBounds: { h: number; w: number },
	appState: CraftWhiteboardRecord,
	padding: number
) {
	const backgroundColor = readString(readRecord(appState), 'viewBackgroundColor')
	if (!backgroundColor) return null

	const frame = editor.getShape(frameID)
	if (!frame) return null
	const id = createShapeId()
	editor.createShape({
		id,
		isLocked: true,
		meta: { [CRAFT_BACKGROUND_META_KEY]: true },
		opacity: 1,
		props: {
			color: mapColor(backgroundColor),
			dash: 'solid',
			fill: 'solid',
			h: Math.max(1, frameBounds.h - padding * 2),
			richText: toRichText(''),
			w: Math.max(1, frameBounds.w - padding * 2),
		},
		type: 'geo',
		x: frame.x + padding,
		y: frame.y + padding,
	})
	editor.reparentShapes([id], frameID)
	editor.sendToBack([id])
	return id
}

function createSpecialNativeShape(
	editor: Editor,
	source: CraftWhiteboardImport,
	element: CraftWhiteboardElement,
	offset: { x: number; y: number }
) {
	const x = readNumber(element, 'x') ?? 0
	const y = readNumber(element, 'y') ?? 0
	const w = Math.max(1, readNumber(element, 'width') ?? 240)
	const h = Math.max(1, readNumber(element, 'height') ?? 160)
	const base = {
		id: createShapeId(),
		isLocked: readBoolean(element, 'locked') ?? false,
		meta: { [CRAFT_ELEMENT_META_KEY]: createCraftElementMeta(
			getElementFamily(element, source.elements)
		) },
		opacity: mapOpacity(readNumber(element, 'opacity') ?? 100),
		rotation: readNumber(element, 'angle') ?? 0,
		x: x + offset.x,
		y: y + offset.y,
	}

	if (NOTE_TYPES.has(element.type) || isCraftStickyElement(element)) {
		const text = readString(getBoundText(element, source.elements) ?? null, 'text')
			?? readString(element, 'text')
			?? ''
		const shape: TLShapePartial = {
			...base,
			type: 'note',
			props: {
				color: mapColor(readString(element, 'backgroundColor') ?? '#ffec99'),
				font: mapFont(readNumber(element, 'fontFamily')),
				richText: toRichText(text),
				scale: Math.max(.1, w / 200),
			},
		}
		editor.createShape(shape)
		return base.id
	}

	if (FRAME_TYPES.has(element.type)) {
		const shape: TLShapePartial = {
			...base,
			type: 'frame',
			props: {
				color: mapColor(readString(element, 'strokeColor') ?? '#1b1b1f'),
				h,
				name: readString(element, 'name') ?? readString(element, 'label') ?? '',
				w,
			},
		}
		editor.createShape(shape)
		return base.id
	}

	if (EMBED_TYPES.has(element.type)) {
		const shape: TLShapePartial = {
			...base,
			type: 'embed',
			props: {
				h,
				url: getElementURL(element),
				w,
			},
		}
		editor.createShape(shape)
		return base.id
	}

	if (element.type === 'image' || element.type === 'video') {
		return createMediaShape(editor, source, element, base, w, h)
	}

	return null
}

function createMediaShape(
	editor: Editor,
	source: CraftWhiteboardImport,
	element: CraftWhiteboardElement,
	base: {
		id: TLShapeId
		isLocked: boolean
		meta: JsonObject
		opacity: .1 | .25 | .5 | .75 | 1
		rotation: number
		x: number
		y: number
	},
	w: number,
	h: number
) {
	const fileID = readString(element, 'fileId')
	const file = fileID ? readRecord(source.assets[fileID]) : null
	const mimeType = readString(file, 'mimeType')
	const src = readString(file, 'dataURL') ?? readString(file, 'url')
	const isVideo = element.type === 'video' || mimeType?.startsWith('video/') === true
	const assetID = src ? AssetRecordType.createId() : null

	if (assetID) {
		editor.createAssets([{
			id: assetID,
			meta: {},
			props: {
				fileSize: readNumber(file, 'size') ?? undefined,
				h,
				isAnimated: isVideo,
				mimeType,
				name: readString(file, 'name') ?? element.id,
				src,
				w,
			},
			type: isVideo ? 'video' : 'image',
			typeName: 'asset',
		}])
	}

	if (isVideo) {
		const shape: TLShapePartial<TLVideoShape> = {
			...base,
			type: 'video',
			props: {
				assetId: assetID,
				autoplay: false,
				h,
				playing: false,
				time: 0,
				w,
			},
		}
		editor.createShape(shape)
		return base.id
	}

	editor.createShape({
		...base,
		type: 'image',
		props: {
			assetId: assetID,
			crop: readImageCrop(element, w, h),
			flipX: readScale(element)[0] < 0,
			flipY: readScale(element)[1] < 0,
			h,
			url: getElementURL(element),
			w,
		},
	})
	return base.id
}

function normalizeExcalidrawElements(elements: readonly CraftWhiteboardElement[]) {
	return elements.flatMap((element): CraftWhiteboardElement[] => {
		const container = getBoundContainer(element, elements)
		if (
			container &&
			(!EXCALIDRAW_NATIVE_TYPES.has(container.type) || isCraftStickyElement(container))
		) return []
		if (!EXCALIDRAW_NATIVE_TYPES.has(element.type)) return []
		if (isCraftStickyElement(element)) return []
		if (
			['arrow', 'freedraw', 'line'].includes(element.type) &&
			(!Array.isArray(element.points) || element.points.length < 2)
		) return []

		return [{
			angle: 0,
			backgroundColor: 'transparent',
			boundElements: null,
			fillStyle: 'solid',
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
			// Grouping happens after all native types exist, including media and frames.
			groupIds: [],
		}]
	})
}

function attachCommonElementMetadata(
	editor: Editor,
	elements: readonly CraftWhiteboardElement[],
	shapes: readonly TLShape[],
	offset: { x: number; y: number }
) {
	const candidates = shapes.filter(({ type }) => type !== 'group')
	const usedShapeIDs = new Set<TLShapeId>()

	for (const element of elements) {
		if (
			isBoundText(element, elements) ||
			!EXCALIDRAW_NATIVE_TYPES.has(element.type) ||
			isCraftStickyElement(element)
		) continue

		const expectedType = getTldrawType(element)
		const expectedX = (readNumber(element, 'x') ?? 0) + offset.x
		const expectedY = (readNumber(element, 'y') ?? 0) + offset.y
		const shape = candidates
			.filter((candidate) =>
				candidate.type === expectedType && !usedShapeIDs.has(candidate.id)
			)
			.map((candidate) => {
				const origin = editor.getShapePageTransform(candidate)?.applyToPoint({ x: 0, y: 0 })
				?? { x: candidate.x, y: candidate.y }
				return {
					distance: Math.hypot(origin.x - expectedX, origin.y - expectedY),
					shape: candidate,
				}
			})
			.sort((left, right) => left.distance - right.distance)[0]?.shape
		if (!shape) continue

		usedShapeIDs.add(shape.id)
		editor.updateShape({
			id: shape.id,
			meta: {
				...shape.meta,
				[CRAFT_ELEMENT_META_KEY]: createCraftElementMeta(
					getElementFamily(element, elements)
				),
			},
			type: shape.type,
		})
	}
}

function applyCraftGroups(
	editor: Editor,
	elements: readonly CraftWhiteboardElement[],
	sourceShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	const maxDepth = Math.max(
		0,
		...elements.map((element) => readStringArray(element.groupIds).length)
	)
	for (let depth = 0; depth < maxDepth; depth += 1) {
		const groups = new Map<string, TLShapeId[]>()
		for (const element of elements) {
			const groupID = readStringArray(element.groupIds)[depth]
			const sourceShapeID = sourceShapeIDs.get(element.id)
			if (!groupID || !sourceShapeID) continue
			const shapeID = getHighestGroupAncestor(editor, sourceShapeID)
			const shapeIDs = groups.get(groupID) ?? []
			if (!shapeIDs.includes(shapeID)) shapeIDs.push(shapeID)
			groups.set(groupID, shapeIDs)
		}

		for (const [groupID, shapeIDs] of groups) {
			if (shapeIDs.length < 2) continue
			editor.groupShapes(shapeIDs)
			const first = editor.getShape(shapeIDs[0])
			if (!first || !isShapeId(first.parentId)) {
				continue
			}
			const group = editor.getShape(first.parentId)
			if (!group || group.type !== 'group') continue
			editor.updateShape({
				id: group.id,
				meta: {
					...group.meta,
					[CRAFT_GROUP_META_KEY]: { groupID },
				},
				type: 'group',
			})
		}
	}
}

function applyCraftFrameMembership(
	editor: Editor,
	elements: readonly CraftWhiteboardElement[],
	sourceShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	for (const element of elements) {
		const frameID = readString(element, 'frameId')
		const shapeID = sourceShapeIDs.get(element.id)
		const targetFrameID = frameID ? sourceShapeIDs.get(frameID) : null
		if (!shapeID || !targetFrameID || shapeID === targetFrameID) continue
		const rootID = getHighestGroupAncestor(editor, shapeID)
		if (rootID !== targetFrameID) editor.reparentShapes([rootID], targetFrameID)
	}
}

function applyCraftArrowBindings(
	editor: Editor,
	elements: readonly CraftWhiteboardElement[],
	sourceShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	for (const element of elements) {
		if (element.type !== 'arrow') continue
		const arrowID = sourceShapeIDs.get(element.id)
		if (!arrowID) continue
		for (const [key, terminal] of [
			['startBinding', 'start'],
			['endBinding', 'end'],
		] as const) {
			const binding = readRecord(element[key])
			const targetElementID = readString(binding, 'elementId')
			const targetID = targetElementID ? sourceShapeIDs.get(targetElementID) : null
			if (!targetID) continue
			editor.createBinding({
				fromId: arrowID,
				props: {
					isExact: false,
					isPrecise: readBoolean(binding, 'focus') !== null,
					normalizedAnchor: { x: .5, y: .5 },
					snap: 'none',
					terminal,
				},
				toId: targetID,
				type: 'arrow',
			})
		}
	}
}

function getImportOffset(
	editor: Editor,
	commonElements: readonly CraftWhiteboardElement[],
	commonShapes: readonly TLShape[],
	allElements: readonly CraftWhiteboardElement[]
) {
	const commonPlacementElements = commonElements.filter((element) =>
		!isBoundText(element, commonElements)
	)
	const sourceBounds = getElementBounds(
		commonPlacementElements.length ? commonPlacementElements : allElements
	)
	if (commonShapes.length) {
		const bounds = Box.Common(commonShapes.flatMap((shape) => {
			const value = editor.getShapePageBounds(shape)
			return value ? [value] : []
		}))
		return {
			x: bounds.x - sourceBounds.x,
			y: bounds.y - sourceBounds.y,
		}
	}
	const viewport = editor.getViewportPageBounds()
	return {
		x: viewport.center.x - sourceBounds.center.x,
		y: viewport.center.y - sourceBounds.center.y,
	}
}

function getElementBounds(elements: readonly CraftWhiteboardElement[]) {
	const boxes = elements.flatMap((element) => {
		const x = readNumber(element, 'x')
		const y = readNumber(element, 'y')
		if (x === null || y === null) return []
		return [{
			h: Math.max(1, readNumber(element, 'height') ?? 1),
			w: Math.max(1, readNumber(element, 'width') ?? 1),
			x,
			y,
		}]
	})
	if (!boxes.length) return new Box(0, 0, 640, 480)
	return Box.Common(boxes.map(({ h, w, x, y }) => new Box(x, y, w, h)))
}

function getElementFamily(
	element: CraftWhiteboardElement,
	elements: readonly CraftWhiteboardElement[]
) {
	const boundIDs = Array.isArray(element.boundElements)
		? element.boundElements.flatMap((value): string[] => {
				const bound = readRecord(value)
				return readString(bound, 'type') === 'text'
					? [readString(bound, 'id') ?? '']
					: []
			}).filter(Boolean)
		: []
	return [
		element,
		...boundIDs.flatMap((id) => {
			const related = elements.find((candidate) => candidate.id === id)
			return related ? [related] : []
		}),
	]
}

function getBoundText(
	element: CraftWhiteboardElement,
	elements: readonly CraftWhiteboardElement[]
) {
	return getElementFamily(element, elements).find(({ type }) => type === 'text')
}

function isBoundText(
	element: CraftWhiteboardElement,
	elements: readonly CraftWhiteboardElement[]
) {
	return getBoundContainer(element, elements) !== null
}

function getBoundContainer(
	element: CraftWhiteboardElement,
	elements: readonly CraftWhiteboardElement[]
) {
	if (element.type !== 'text') return null
	const containerID = readString(element, 'containerId')
	if (containerID) {
		return elements.find((candidate) => candidate.id === containerID) ?? null
	}
	return elements.find((candidate) =>
		Array.isArray(candidate.boundElements) &&
		candidate.boundElements.some((value) => readString(readRecord(value), 'id') === element.id)
	) ?? null
}

function isCraftStickyElement(element: CraftWhiteboardElement) {
	if (NOTE_TYPES.has(element.type)) return true
	for (const key of ['customData', 'data']) {
		const record = readRecord(element[key])
		for (const name of ['type', 'kind', 'elementType']) {
			const value = readString(record, name)?.toLowerCase()
			if (value?.includes('sticky') || value === 'note') return true
		}
	}
	return false
}

function getTldrawType(element: CraftWhiteboardElement) {
	if (['rectangle', 'ellipse', 'diamond'].includes(element.type)) return 'geo'
	if (element.type === 'freedraw') return 'draw'
	return element.type
}

function getHighestGroupAncestor(editor: Editor, shapeID: TLShapeId) {
	let currentID = shapeID
	for (;;) {
		const shape = editor.getShape(currentID)
		if (
			!shape ||
			!isShapeId(shape.parentId)
		) return currentID
		const parent = editor.getShape(shape.parentId)
		if (!parent || parent.type !== 'group') return currentID
		currentID = parent.id
	}
}

function getSourceOrigin(elements: readonly CraftWhiteboardElement[]) {
	const positions = elements.flatMap((element) => {
		const x = readNumber(element, 'x')
		const y = readNumber(element, 'y')
		return x !== null && y !== null ? [{ x, y }] : []
	})
	return {
		x: positions.length ? Math.min(...positions.map(({ x }) => x)) : 0,
		y: positions.length ? Math.min(...positions.map(({ y }) => y)) : 0,
	}
}

function getElementURL(element: CraftWhiteboardElement) {
	for (const key of ['url', 'link']) {
		const value = readString(element, key)
		if (value) return value
	}
	const customData = readRecord(element.customData)
	return readString(customData, 'url') ?? ''
}

function readScale(element: CraftWhiteboardElement): [number, number] {
	const scale = scaleSchema.safeParse(element.scale)
	return scale.success ? scale.data : [1, 1]
}

function readImageCrop(
	element: CraftWhiteboardElement,
	fallbackWidth: number,
	fallbackHeight: number
) {
	const crop = readRecord(element.crop)
	if (!crop) return null
	const naturalWidth = readNumber(crop, 'naturalWidth') ?? fallbackWidth
	const naturalHeight = readNumber(crop, 'naturalHeight') ?? fallbackHeight
	const x = readNumber(crop, 'x')
	const y = readNumber(crop, 'y')
	const width = readNumber(crop, 'width')
	const height = readNumber(crop, 'height')
	if (
		x === null ||
		y === null ||
		width === null ||
		height === null ||
		naturalWidth <= 0 ||
		naturalHeight <= 0
	) return null
	return {
		bottomRight: {
			x: (x + width) / naturalWidth,
			y: (y + height) / naturalHeight,
		},
		topLeft: {
			x: x / naturalWidth,
			y: y / naturalHeight,
		},
	}
}

function elementToJSON(element: CraftWhiteboardElement): JsonObject {
	const value: JsonObject = {}
	for (const [key, entry] of Object.entries(element)) value[key] = entry
	return value
}

function mapOpacity(value: number): .1 | .25 | .5 | .75 | 1 {
	const opacity = value / 100
	if (opacity < .2) return .1
	if (opacity < .4) return .25
	if (opacity < .6) return .5
	if (opacity < .8) return .75
	return 1
}

const EXCALIDRAW_COLORS = new Map(Object.entries({
	'#000000': 'black',
	'#099268': 'green',
	'#0c8599': 'blue',
	'#1971c2': 'blue',
	'#1b1b1f': 'black',
	'#2f9e44': 'green',
	'#3b5bdb': 'blue',
	'#6741d9': 'violet',
	'#868e96': 'grey',
	'#9c36b5': 'violet',
	'#a5d8ff': 'light-blue',
	'#b2f2bb': 'light-green',
	'#c2255c': 'red',
	'#d0bfff': 'light-violet',
	'#e03131': 'red',
	'#f08c00': 'orange',
	'#ffc9c9': 'light-red',
	'#ffd43b': 'yellow',
	'#ffec99': 'yellow',
	'#ffffff': 'white',
} satisfies Record<string, TLDefaultColorStyle>))

function mapColor(value: string): TLDefaultColorStyle {
	return EXCALIDRAW_COLORS.get(value.toLowerCase()) ?? 'black'
}

function mapFont(value: number | null): TLDefaultFontStyle {
	if (value === 1) return 'draw'
	if (value === 3) return 'mono'
	return 'sans'
}

function readRecord<Value>(value: Value): CraftWhiteboardRecord | null {
	const parsed = craftRecordSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}

function readString(record: CraftWhiteboardRecord | null, key: string) {
	const value = z.string().safeParse(record?.[key])
	return value.success ? value.data : null
}

function readNumber(record: CraftWhiteboardRecord | null, key: string) {
	const value = z.number().finite().safeParse(record?.[key])
	return value.success ? value.data : null
}

function readBoolean(record: CraftWhiteboardRecord | null, key: string) {
	const value = z.boolean().safeParse(record?.[key])
	return value.success ? value.data : null
}

function readStringArray<Value>(value: Value) {
	const entries = z.array(z.string()).safeParse(value)
	return entries.success ? entries.data : []
}
