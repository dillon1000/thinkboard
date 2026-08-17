import {
	CRAFT_WHITEBOARD_CONFLICT_MESSAGE,
	MAX_CRAFT_WHITEBOARD_ELEMENTS,
	craftAPIRoutes,
	craftWhiteboardImportSchema,
	craftWhiteboardSaveOutputSchema,
	createCraftWhiteboardRevision,
	type CraftWhiteboardElement,
	type CraftWhiteboardImport,
	type CraftWhiteboardRecord,
	type CraftWhiteboardSaveOutput,
} from '@agentboard/shared'
import { z } from 'zod'
import {
	Box,
	b64Vecs,
	createShapeId,
	isShapeId,
	renderPlaintextFromRichText,
	type Editor,
	type JsonObject,
	type JsonValue,
	type TLArrowShape,
	type TLDrawShape,
	type TLEmbedShape,
	type TLFrameShape,
	type TLGeoShape,
	type TLImageShape,
	type TLLineShape,
	type TLNoteShape,
	type TLShape,
	type TLShapeId,
	type TLTextShape,
	type TLVideoShape,
} from 'tldraw'
import { apiRequest } from '../../../lib/api'
import {
	addCraftWhiteboardBackground,
	isCraftBackgroundShape,
	putNativeCraftWhiteboardContent,
	readCraftElementMetadata,
	readCraftGroupID,
} from './craftWhiteboardNative'

const CRAFT_WHITEBOARD_META_KEY = 'agentboardCraftWhiteboard'
const CRAFT_WHITEBOARD_FRAME_PADDING = 48
const craftRecordSchema = z.record(z.string(), z.json())
const JSONPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const SAVABLE_TLDRAW_TYPES = new Set([
	'arrow',
	'draw',
	'embed',
	'frame',
	'geo',
	'image',
	'line',
	'note',
	'text',
	'video',
])

interface CraftWhiteboardFrameMetadata {
	appState: CraftWhiteboardRecord
	connectionOwnerID: string | null
	documentID: string
	framePadding: number
	localRevision: string | null
	remoteRevision: string | null
	schemaVersion: number
	sourceElementIDs: string[]
	sourceElements: CraftWhiteboardElement[]
	sourceOriginX: number
	sourceOriginY: number
	title: string
	whiteboardBlockID: string
}

type CraftShapeByType = { arrow: TLArrowShape; draw: TLDrawShape; embed: TLEmbedShape; frame: TLFrameShape; geo: TLGeoShape; image: TLImageShape; line: TLLineShape; note: TLNoteShape; text: TLTextShape; video: TLVideoShape }

export interface ImportedCraftWhiteboard extends CraftWhiteboardFrameMetadata {
	frameID: TLShapeId
}

export type CraftWhiteboardSyncResolution = 'agentboard' | 'craft' | 'safe'

export interface CraftWhiteboardSyncResult {
	status: 'conflict' | 'synced'
	title: string
}

/**
 * Imports each Craft whiteboard tool as its native tldraw shape, then places the editable scene
 * in a named frame. Source IDs and records remain attached for targeted, lossless updates.
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

	const source = await apiRequest(
		craftAPIRoutes.boardWhiteboard(boardID, documentID, whiteboardBlockID),
		undefined,
		craftWhiteboardImportSchema
	)
	editor.markHistoryStoppingPoint('import Craft whiteboard')
	const content = await putNativeCraftWhiteboardContent(editor, source)
	const bounds = content.shapes.length
		? getCommonBounds(editor, content.shapes)
		: {
				h: 480,
				w: 640,
				x: editor.getViewportPageBounds().center.x - 320,
				y: editor.getViewportPageBounds().center.y - 240,
			}
	const frameID = createShapeId()
	editor.createShape({
		id: frameID,
		props: {
			h: Math.max(160, bounds.h + CRAFT_WHITEBOARD_FRAME_PADDING * 2),
			name: `Craft · ${source.title}`,
			w: Math.max(240, bounds.w + CRAFT_WHITEBOARD_FRAME_PADDING * 2),
		},
		type: 'frame',
		x: bounds.x - CRAFT_WHITEBOARD_FRAME_PADDING,
		y: bounds.y - CRAFT_WHITEBOARD_FRAME_PADDING,
	})
	const metadata: CraftWhiteboardFrameMetadata = {
		appState: source.appState,
		connectionOwnerID: source.connectionOwnerID ?? null,
		documentID,
		framePadding: CRAFT_WHITEBOARD_FRAME_PADDING,
		localRevision: null,
		remoteRevision: source.revision,
		schemaVersion: 3,
		sourceElementIDs: content.sourceElementIDs,
		sourceElements: source.elements,
		sourceOriginX: content.sourceOrigin.x,
		sourceOriginY: content.sourceOrigin.y,
		title: source.title,
		whiteboardBlockID,
	}

	if (content.rootShapeIDs.length) editor.reparentShapes(content.rootShapeIDs, frameID)
	addCraftWhiteboardBackground(
		editor,
		frameID,
		{
			h: Math.max(160, bounds.h + CRAFT_WHITEBOARD_FRAME_PADDING * 2),
			w: Math.max(240, bounds.w + CRAFT_WHITEBOARD_FRAME_PADDING * 2),
		},
		source.appState,
		CRAFT_WHITEBOARD_FRAME_PADDING
	)
	const importedMetadata = {
		...metadata,
		localRevision: await createLocalWhiteboardRevision(editor, frameID),
	}
	updateCraftWhiteboardMetadata(editor, frameID, importedMetadata)
	editor.select(frameID)
	editor.zoomToSelection()
	return { ...importedMetadata, frameID }
}

/**
 * Writes an element diff for one imported frame. Existing source IDs use PUT, local additions use
 * POST, and removed source IDs use DELETE after the Worker checks the last Craft revision.
 */
export async function saveCraftWhiteboard(
	editor: Editor,
	boardID: string,
	frameID: TLShapeId,
	expectedRevision?: string,
	connectionOwnerID?: string,
	comparisonElements?: readonly CraftWhiteboardElement[]
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
	const managedSourceElements = (comparisonElements ?? metadata.sourceElements).filter(({ id }) =>
		metadata.sourceElementIDs.includes(id)
	)
	const changes = await createCraftElementDiff(managedSourceElements, elements)
	if (
		!changes.elementsToAdd.length &&
		!changes.elementsToUpdate.length &&
		!changes.elementIDsToDelete.length
	) {
		const revision = expectedRevision ?? metadata.remoteRevision
		if (!revision) throw new Error(CRAFT_WHITEBOARD_CONFLICT_MESSAGE)
		return { added: 0, deleted: 0, revision, updated: 0 } satisfies CraftWhiteboardSaveOutput
	}
	const revision = expectedRevision ?? metadata.remoteRevision
	if (!revision) throw new Error(CRAFT_WHITEBOARD_CONFLICT_MESSAGE)

	const output = await apiRequest(
		craftAPIRoutes.boardWhiteboard(
			boardID,
			metadata.documentID,
			metadata.whiteboardBlockID
		),
		{
			body: JSON.stringify({
				...changes,
				expectedRevision: revision,
			}),
			method: 'PUT',
		},
		craftWhiteboardSaveOutputSchema
	)
	updateCraftWhiteboardMetadata(editor, frameID, {
		...metadata,
		connectionOwnerID: connectionOwnerID ?? metadata.connectionOwnerID,
		localRevision: await createLocalWhiteboardRevision(editor, frameID),
		remoteRevision: output.revision,
		schemaVersion: 3,
		sourceElementIDs: elements.map(({ id }) => id),
		sourceElements: [
			...metadata.sourceElements.filter(({ id }) =>
				!metadata.sourceElementIDs.includes(id)
			),
			...elements,
		],
	})
	return output
}

/**
 * Compares serialized native shapes with the last Craft snapshot. IDs are the synchronization
 * boundary, and stable element hashes stop unchanged source records from being sent through PUT.
 */
export async function createCraftElementDiff(
	sourceElements: readonly CraftWhiteboardElement[],
	currentElements: readonly CraftWhiteboardElement[]
) {
	const sourceByID = new Map(sourceElements.map((element) => [element.id, element]))
	const currentIDs = new Set(currentElements.map(({ id }) => id))
	const elementsToAdd: CraftWhiteboardElement[] = []
	const elementsToUpdate: CraftWhiteboardElement[] = []

	for (const element of currentElements) {
		const source = sourceByID.get(element.id)
		if (!source) {
			elementsToAdd.push(element)
			continue
		}
		const [sourceRevision, currentRevision] = await Promise.all([
			createCraftWhiteboardRevision(source),
			createCraftWhiteboardRevision(element),
		])
		if (sourceRevision !== currentRevision) elementsToUpdate.push(element)
	}

	return {
		elementIDsToDelete: sourceElements
			.filter(({ id }) => !currentIDs.has(id))
			.map(({ id }) => id),
		elementsToAdd,
		elementsToUpdate,
	}
}

/**
 * Reconciles one imported frame with Craft. Safe mode stops on concurrent changes. The explicit
 * resolutions let the user accept one side after they review a conflict.
 */
export async function syncCraftWhiteboard(
	editor: Editor,
	boardID: string,
	frameID: TLShapeId,
	resolution: CraftWhiteboardSyncResolution = 'safe'
): Promise<CraftWhiteboardSyncResult> {
	const frame = editor.getShape<TLFrameShape>(frameID)
	const metadata = frame ? readCraftWhiteboardMetadata(frame.meta) : null
	if (!frame || frame.type !== 'frame' || !metadata) {
		throw new Error('The imported Craft whiteboard is no longer available.')
	}
	const source = await apiRequest(
		craftAPIRoutes.boardWhiteboard(
			boardID,
			metadata.documentID,
			metadata.whiteboardBlockID
		),
		{ cache: 'no-store' },
		craftWhiteboardImportSchema
	)
	if (resolution === 'craft') {
		await replaceCraftWhiteboardFrame(editor, frame, metadata, source)
		return { status: 'synced', title: metadata.title }
	}

	const localRevision = await createLocalWhiteboardRevision(editor, frameID)
	if (!metadata.localRevision || !metadata.remoteRevision) {
		if (resolution === 'agentboard') {
			await saveCraftWhiteboard(
				editor,
				boardID,
				frameID,
				source.revision,
				source.connectionOwnerID,
				source.elements
			)
			return { status: 'synced', title: metadata.title }
		}
		return { status: 'conflict', title: metadata.title }
	}

	const localChanged = localRevision !== metadata.localRevision
	const remoteChanged = source.revision !== metadata.remoteRevision
	if (resolution === 'agentboard') {
		await saveCraftWhiteboard(
			editor,
			boardID,
			frameID,
			source.revision,
			source.connectionOwnerID,
			source.elements
		)
		return { status: 'synced', title: metadata.title }
	}
	if (localChanged && remoteChanged) {
		return { status: 'conflict', title: metadata.title }
	}
	if (remoteChanged) {
		await replaceCraftWhiteboardFrame(editor, frame, metadata, source)
	} else if (localChanged) {
		await saveCraftWhiteboard(
			editor,
			boardID,
			frameID,
			metadata.remoteRevision,
			source.connectionOwnerID
		)
	}
	return { status: 'synced', title: metadata.title }
}

export async function hasCraftWhiteboardLocalChanges(
	editor: Editor,
	frameID: TLShapeId
) {
	const frame = editor.getShape<TLFrameShape>(frameID)
	const metadata = frame ? readCraftWhiteboardMetadata(frame.meta) : null
	if (!metadata?.localRevision) return true
	return await createLocalWhiteboardRevision(editor, frameID) !== metadata.localRevision
}

export function listImportedCraftWhiteboards(editor: Editor): ImportedCraftWhiteboard[] {
	return editor.getCurrentPageShapes().flatMap((shape): ImportedCraftWhiteboard[] => {
		if (shape.type !== 'frame') return []
		const metadata = readCraftWhiteboardMetadata(shape.meta)
		return metadata ? [{ ...metadata, frameID: shape.id }] : []
	})
}

async function replaceCraftWhiteboardFrame(
	editor: Editor,
	frame: TLFrameShape,
	metadata: CraftWhiteboardFrameMetadata,
	source: CraftWhiteboardImport
) {
	const oldDescendantIDs = [...editor.getShapeAndDescendantIds([frame.id])]
		.filter((id) => id !== frame.id)
	const frameOrigin = editor.getShapePageTransform(frame)?.applyToPoint({ x: 0, y: 0 })
	if (!frameOrigin) throw new Error('The Craft whiteboard frame is not available.')

	editor.markHistoryStoppingPoint('sync Craft whiteboard')
	const content = await putNativeCraftWhiteboardContent(editor, source)
	const bounds = content.shapes.length
		? getCommonBounds(editor, content.shapes)
		: { h: 64, w: 144, x: frameOrigin.x, y: frameOrigin.y }
	if (content.rootShapeIDs.length) {
		editor.nudgeShapes(content.rootShapeIDs, {
			x: frameOrigin.x + metadata.framePadding - bounds.x,
			y: frameOrigin.y + metadata.framePadding - bounds.y,
		})
		editor.reparentShapes(content.rootShapeIDs, frame.id)
	}
	if (oldDescendantIDs.length) editor.deleteShapes(oldDescendantIDs)

	editor.updateShape({
		id: frame.id,
		props: {
			h: Math.max(160, bounds.h + metadata.framePadding * 2),
			w: Math.max(240, bounds.w + metadata.framePadding * 2),
		},
		type: 'frame',
	})
	addCraftWhiteboardBackground(
		editor,
		frame.id,
		{
			h: Math.max(160, bounds.h + metadata.framePadding * 2),
			w: Math.max(240, bounds.w + metadata.framePadding * 2),
		},
		source.appState,
		metadata.framePadding
	)
	const nextMetadata: CraftWhiteboardFrameMetadata = {
		...metadata,
		appState: source.appState,
		connectionOwnerID: source.connectionOwnerID ?? metadata.connectionOwnerID,
		localRevision: null,
		remoteRevision: source.revision,
		schemaVersion: 3,
		sourceElementIDs: content.sourceElementIDs,
		sourceElements: source.elements,
		sourceOriginX: content.sourceOrigin.x,
		sourceOriginY: content.sourceOrigin.y,
		title: source.title,
	}
	updateCraftWhiteboardMetadata(editor, frame.id, {
		...nextMetadata,
		localRevision: await createLocalWhiteboardRevision(editor, frame.id),
	})
}

async function createLocalWhiteboardRevision(editor: Editor, frameID: TLShapeId) {
	const elements = [...editor.getShapeAndDescendantIds([frameID])]
		.flatMap((id) => {
			const shape = editor.getShape(id)
			if (
				!shape ||
				shape.id === frameID ||
				isCraftBackgroundShape(shape) ||
				!SAVABLE_TLDRAW_TYPES.has(shape.type)
			) return []
			return [{
				id: shape.id,
				index: shape.index,
				isLocked: shape.isLocked,
				meta: shape.meta,
				opacity: shape.opacity,
				parentId: shape.parentId,
				props: shape.props,
				rotation: shape.rotation,
				type: shape.type,
				x: shape.x,
				y: shape.y,
			}]
		})
		.sort((left, right) => left.id.localeCompare(right.id))
	return createCraftWhiteboardRevision(elements)
}

function updateCraftWhiteboardMetadata(
	editor: Editor,
	frameID: TLShapeId,
	metadata: CraftWhiteboardFrameMetadata
) {
	const frame = editor.getShape<TLFrameShape>(frameID)
	if (!frame) return
	editor.updateShape({
		id: frameID,
		meta: {
			...frame.meta,
			[CRAFT_WHITEBOARD_META_KEY]: toMetadataJSON(metadata),
		},
		type: 'frame',
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
		return shape &&
			shape.id !== frame.id &&
			shape.type !== 'group' &&
			!isCraftBackgroundShape(shape)
			? [shape]
			: []
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

	let generated: CraftWhiteboardElement[]
	switch (shape.type) {
		case 'geo':
			generated = serializeGeo(editor, getCraftShape(shape, 'geo'), position, angle)
			break
		case 'text':
			generated = [createTextElement(
				renderPlaintextFromRichText(editor, getCraftShape(shape, 'text').props.richText),
				position.x,
				position.y,
				Math.max(1, bounds.w),
				Math.max(1, bounds.h),
				shape,
				angle
			)]
			break
		case 'note':
			generated = serializeNote(
				editor,
				getCraftShape(shape, 'note'),
				position,
				bounds.w,
				bounds.h,
				angle
			)
			break
		case 'arrow':
			generated = serializeArrow(editor, getCraftShape(shape, 'arrow'), position, angle)
			break
		case 'line':
			generated = [serializeLine(getCraftShape(shape, 'line'), position, angle)]
			break
		case 'draw':
			generated = serializeDraw(getCraftShape(shape, 'draw'), position, angle)
			break
		case 'frame':
			generated = [serializeFrame(getCraftShape(shape, 'frame'), position, angle)]
			break
		case 'embed':
			generated = [serializeEmbed(getCraftShape(shape, 'embed'), position, angle)]
			break
		case 'image':
			generated = [serializeMedia(editor, getCraftShape(shape, 'image'), position, angle)]
			break
		case 'video':
			generated = [serializeMedia(editor, getCraftShape(shape, 'video'), position, angle)]
			break
		default:
			return []
	}
	return mergeCraftElementIdentity(editor, shape, generated, metadata)
}

function getCraftShape<Type extends keyof CraftShapeByType>(
	shape: TLShape,
	type: Type
): CraftShapeByType[Type] {
	if (shape.type !== type) throw new Error(`Expected a ${type} shape.`)
	// SAFETY: The runtime discriminator matches the requested built-in tldraw shape.
	return shape as CraftShapeByType[Type]
}

function serializeFrame(
	shape: TLFrameShape,
	position: { x: number; y: number },
	angle: number
) {
	return {
		...createElementBase(
			createElementID(),
			'frame',
			position.x,
			position.y,
			Math.max(1, shape.props.w),
			Math.max(1, shape.props.h),
			shape,
			angle
		),
		name: shape.props.name,
	}
}

function serializeEmbed(
	shape: TLEmbedShape,
	position: { x: number; y: number },
	angle: number
) {
	return {
		...createElementBase(
			createElementID(),
			'embeddable',
			position.x,
			position.y,
			Math.max(1, shape.props.w),
			Math.max(1, shape.props.h),
			shape,
			angle
		),
		link: shape.props.url || null,
		url: shape.props.url,
	}
}

function serializeMedia(
	editor: Editor,
	shape: TLImageShape | TLVideoShape,
	position: { x: number; y: number },
	angle: number
) {
	const element: CraftWhiteboardElement = {
		...createElementBase(
			createElementID(),
			shape.type,
			position.x,
			position.y,
			Math.max(1, shape.props.w),
			Math.max(1, shape.props.h),
			shape,
			angle
		),
	}
	if (shape.type === 'image') {
		element.link = shape.props.url || null
		element.scale = [shape.props.flipX ? -1 : 1, shape.props.flipY ? -1 : 1]
		const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null
		if (shape.props.crop && asset && asset.type === 'image') {
			const { topLeft, bottomRight } = shape.props.crop
			element.crop = {
				height: (bottomRight.y - topLeft.y) * asset.props.h,
				naturalHeight: asset.props.h,
				naturalWidth: asset.props.w,
				width: (bottomRight.x - topLeft.x) * asset.props.w,
				x: topLeft.x * asset.props.w,
				y: topLeft.y * asset.props.h,
			}
		}
	}
	return element
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
	const labelID = text ? createElementID() : null
	const element = {
		...createLinearElementBase(id, 'arrow', position, points, shape, angle),
		boundElements: labelID ? [{ id: labelID, type: 'text' }] : null,
		elbowed: shape.props.kind === 'elbow',
		endArrowhead: getExcalidrawArrowhead(shape.props.arrowheadEnd),
		startArrowhead: getExcalidrawArrowhead(shape.props.arrowheadStart),
	}
	if (!labelID) return [element]
	return [
		element,
		createTextElement(
			text,
			position.x + element.width / 2 - 60,
			position.y + element.height / 2 - 12,
			120,
			24,
			shape,
			angle,
			labelID,
			id
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
		strokeColor: getShapeLabelColor(shape),
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

function mergeCraftElementIdentity(
	editor: Editor,
	shape: TLShape,
	generated: readonly CraftWhiteboardElement[],
	metadata: CraftWhiteboardFrameMetadata
) {
	const shapeMetadata = readCraftElementMetadata(shape.meta)
	const stableIDs = generated.map((_, index) => getStableElementID(shape, index))
	const sourceElements = shapeMetadata?.sourceElements ??
		stableIDs.flatMap((id) => {
			const source = metadata.sourceElements.find((element) => element.id === id)
			return source ? [source] : []
		})
	const sourcePrimary = sourceElements.find(({ type }) => type !== 'text')
	const sourceText = sourceElements.find(({ type }) => type === 'text')
	const IDMap = new Map<string, string>()

	const merged = generated.map((element, index): CraftWhiteboardElement => {
		const source = element.type === 'text'
			? sourceText
			: sourcePrimary ?? sourceElements[index]
		const id = source?.id ?? stableIDs[index]
		IDMap.set(element.id, id)
		return {
			...source,
			...element,
			id,
			seed: source?.seed ?? stableSeed(`${shape.id}:${index}:seed`),
			type: source?.type ?? element.type,
			updated: source?.updated ?? 0,
			version: source?.version ?? 1,
			versionNonce: source?.versionNonce ?? stableSeed(`${shape.id}:${index}:nonce`),
		}
	})

	const groupIds = getCraftGroupIDs(editor, shape)
	const frameId = getCraftFrameElementID(editor, shape)
	const withRelationships = merged.map((element): CraftWhiteboardElement => ({
		...element,
		boundElements: Array.isArray(element.boundElements)
			? element.boundElements.map((value) => {
					const bound = readRecord(value)
					const id = readString(bound, 'id')
					return id && IDMap.has(id)
						? { ...bound, id: IDMap.get(id) ?? id }
						: value
				})
			: element.boundElements,
		containerId: remapElementID(element.containerId, IDMap),
		frameId,
		groupIds,
	}))

	if (shape.type !== 'arrow') return withRelationships
	const arrow = withRelationships.find(({ type }) => type !== 'text')
	if (!arrow) return withRelationships
	const bindings = editor.getBindingsFromShape(shape.id, 'arrow')
	for (const binding of bindings) {
		const target = editor.getShape(binding.toId)
		const targetMetadata = target ? readCraftElementMetadata(target.meta) : null
		const targetElement = targetMetadata?.sourceElements.find(({ type }) => type !== 'text')
		if (!target) continue
		const value = {
			elementId: targetElement?.id ?? getStableElementID(target, 0),
			focus: 0,
			gap: 1,
		}
		if (binding.props.terminal === 'start') arrow.startBinding = value
		if (binding.props.terminal === 'end') arrow.endBinding = value
	}
	return withRelationships
}

function getCraftGroupIDs(editor: Editor, shape: TLShape) {
	const groupIDs: string[] = []
	let parentID = shape.parentId
	while (isShapeId(parentID)) {
		const parent = editor.getShape(parentID)
		if (!parent) break
		if (parent.type === 'group') {
			groupIDs.push(readCraftGroupID(parent.meta) ?? getStableContainerID(parent.id))
		}
		parentID = parent.parentId
	}
	return groupIDs
}

function remapElementID<Value>(value: Value, IDMap: ReadonlyMap<string, string>): Value | string {
	const id = z.string().safeParse(value)
	return id.success ? IDMap.get(id.data) ?? id.data : value
}

function getCraftFrameElementID(editor: Editor, shape: TLShape) {
	let parentID = shape.parentId
	while (isShapeId(parentID)) {
		const parent = editor.getShape(parentID)
		if (!parent) break
		if (parent.type === 'frame') {
			if (readCraftWhiteboardMetadata(parent.meta)) return null
			const source = readCraftElementMetadata(parent.meta)
				?.sourceElements.find(({ type }) => type !== 'text')
			return source?.id ?? getStableElementID(parent, 0)
		}
		parentID = parent.parentId
	}
	return null
}

function getStableElementID(shape: TLShape, index: number) {
	return `agentboard-${shape.id.slice('shape:'.length)}-${index}`
		.replace(/[^a-zA-Z0-9_-]/g, '-')
		.slice(0, 256)
}

function getStableContainerID(shapeID: TLShapeId) {
	return `agentboard-group-${shapeID.slice('shape:'.length)}`
		.replace(/[^a-zA-Z0-9_-]/g, '-')
		.slice(0, 256)
}

function stableSeed(value: string) {
	let seed = 2_166_136_261
	for (let index = 0; index < value.length; index += 1) {
		seed ^= value.charCodeAt(index)
		seed = Math.imul(seed, 16_777_619)
	}
	return seed >>> 1
}

function getCommonBounds(editor: Editor, shapes: readonly TLShape[]) {
	const bounds = shapes.flatMap((shape) => {
		const value = editor.getShapePageBounds(shape)
		return value ? [value] : []
	})
	if (!bounds.length) throw new Error('Unable to place the imported Craft whiteboard.')
	return Box.Common(bounds)
}

function readCraftWhiteboardMetadata(meta: JsonObject): CraftWhiteboardFrameMetadata | null {
	const record = readRecord(meta[CRAFT_WHITEBOARD_META_KEY])
	const appState = readRecord(record?.appState) ?? {}
	const documentID = readString(record, 'documentID')
	const whiteboardBlockID = readString(record, 'whiteboardBlockID')
	const title = readString(record, 'title')
	const framePadding = readNumber(record, 'framePadding')
	const sourceOriginX = readNumber(record, 'sourceOriginX')
	const sourceOriginY = readNumber(record, 'sourceOriginY')
	const sourceElementIDs = z.array(z.string()).safeParse(record?.sourceElementIDs)
	const sourceElements = Array.isArray(record?.sourceElements)
		? record.sourceElements.flatMap((value): CraftWhiteboardElement[] => {
				const element = readRecord(value)
				const id = readString(element, 'id')
				const type = readString(element, 'type')
				return element && id && type ? [{ ...element, id, type }] : []
			})
		: []
	if (
		!documentID ||
		!whiteboardBlockID ||
		!title ||
		framePadding === null ||
		sourceOriginX === null ||
		sourceOriginY === null ||
		!sourceElementIDs.success
	) return null
	return {
		appState,
		connectionOwnerID: readString(record, 'connectionOwnerID'),
		documentID,
		framePadding,
		localRevision: readString(record, 'localRevision'),
		remoteRevision: readString(record, 'remoteRevision'),
		schemaVersion: readNumber(record, 'schemaVersion') ?? 1,
		sourceElementIDs: sourceElementIDs.data,
		sourceElements,
		sourceOriginX,
		sourceOriginY,
		title,
		whiteboardBlockID,
	}
}

function toMetadataJSON(metadata: CraftWhiteboardFrameMetadata): JsonObject {
	return {
		appState: toJSONValue(metadata.appState),
		connectionOwnerID: metadata.connectionOwnerID,
		documentID: metadata.documentID,
		framePadding: metadata.framePadding,
		localRevision: metadata.localRevision,
		remoteRevision: metadata.remoteRevision,
		schemaVersion: metadata.schemaVersion,
		sourceElementIDs: metadata.sourceElementIDs,
		sourceElements: metadata.sourceElements,
		sourceOriginX: metadata.sourceOriginX,
		sourceOriginY: metadata.sourceOriginY,
		title: metadata.title,
		whiteboardBlockID: metadata.whiteboardBlockID,
	}
}

function toJSONValue<Value>(value: Value): JsonValue {
	const primitive = JSONPrimitiveSchema.safeParse(value)
	if (primitive.success) return primitive.data
	if (Array.isArray(value)) return value.map(toJSONValue)
	const record = readRecord(value)
	if (!record) return null
	const output: JsonObject = {}
	for (const [key, entry] of Object.entries(record)) output[key] = toJSONValue(entry)
	return output
}

function normalizePoints(points: readonly { x: number; y: number }[]) {
	const first = points[0] ?? { x: 0, y: 0 }
	return points.map(({ x, y }) => [x - first.x, y - first.y])
}

function getShapeColor(shape: TLShape) {
	const color = z.string().safeParse('color' in shape.props ? shape.props.color : undefined)
	return color.success ? getExcalidrawColor(color.data) : '#1b1b1f'
}

function getShapeLabelColor(shape: TLShape) {
	const color = z.string().safeParse(
		'labelColor' in shape.props ? shape.props.labelColor : undefined
	)
	return color.success ? getExcalidrawColor(color.data) : getShapeColor(shape)
}

function getShapeDash(shape: TLShape) {
	const dash = z.string().safeParse('dash' in shape.props ? shape.props.dash : undefined)
	return dash.success ? getExcalidrawStrokeStyle(dash.data) : 'solid'
}

function getShapeStrokeWidth(shape: TLShape) {
	const size = z.string().safeParse('size' in shape.props ? shape.props.size : undefined)
	return size.success ? getExcalidrawStrokeWidth(size.data) : 2
}

function getShapeFont(shape: TLShape) {
	const font = z.string().safeParse('font' in shape.props ? shape.props.font : undefined)
	return font.success ? font.data : 'sans'
}

function getShapeFontSize(shape: TLShape) {
	const size = z.string().safeParse('size' in shape.props ? shape.props.size : undefined)
	return size.success ? { l: 28, m: 20, s: 16, xl: 36 }[size.data] ?? 20 : 20
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

function readRecord<Value>(value: Value): CraftWhiteboardRecord | null {
	const parsed = craftRecordSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}

function readString(record: CraftWhiteboardRecord | null, key: string) {
	const value = z.string().safeParse(record?.[key])
	return value.success && value.data.trim() ? value.data : null
}

function readNumber(record: CraftWhiteboardRecord | null, key: string) {
	const value = z.number().finite().safeParse(record?.[key])
	return value.success ? value.data : null
}
