import {
	normalizeCanvasPlanInput,
	type CanvasConnector,
	type CanvasObjectReference,
	type CanvasPlan,
	type CanvasPlanElement,
	type CanvasShapeStyle,
	type CanvasSize,
	type CanvasAnchor,
} from '@agentboard/shared'
import {
	Box,
	createShapeId,
	getIndexAbove,
	isShapeId,
	toRichText,
	type Editor,
	type TLArrowShape,
	type TLBaseShape,
	type TLFrameShape,
	type TLGeoShape,
	type TLLineShape,
	type TLNoteShape,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
	type TLTextShape,
} from 'tldraw'
import {
	resolveCanvasPlacement,
	resolveCanvasPlanLayout,
	type CanvasLayoutBox,
	type CanvasLayoutEnvironment,
	type CanvasLayoutReference,
} from './canvasPlanLayout'

export interface ApplyCanvasPlanOptions {
	/** Moves the full resolved plan so its top-left corner starts at this cursor position. */
	anchor?: CanvasAnchor
	documentClock?: number
	select?: boolean
}

export interface CanvasPlanEffect {
	planID: string
	shapeIDs: TLShapeId[]
}

const NOTE_SIZE = 200
const MATH_SHAPE_TYPE = 'agentboard-math' as const
type CanvasMathShape = TLBaseShape<typeof MATH_SHAPE_TYPE, {
	w: number
	h: number
	latex: string
	fontSize: number
	schemaVersion: number
}>

/**
 * Applies one validated plan as one undoable editor operation. A failed mutation returns the
 * editor to its history mark, including deletions and changes to existing shapes.
 */
export function applyCanvasPlan<Input>(
	editor: Editor,
	input: Input,
	{ anchor, documentClock, select }: ApplyCanvasPlanOptions = {}
): CanvasPlanEffect {
	const plan = normalizeCanvasPlanInput(input)
	const planShapeIDs = createPlanShapeIDs(plan)
	const existingPlanShapes = findPlanShapes(editor, planShapeIDs)
	if (existingPlanShapes.length) {
		if (existingPlanShapes.length !== planShapeIDs.size) {
			throw new Error('This canvas plan was only partially applied')
		}
		return { planID: plan.planID, shapeIDs: existingPlanShapes.map(({ id }) => id) }
	}
	if (
		documentClock !== undefined &&
		plan.baseDocumentClock !== undefined &&
		documentClock !== plan.baseDocumentClock
	) {
		throw new Error('The space changed after this canvas plan was created')
	}

	validatePlanTargets(editor, plan, planShapeIDs)
	const environment = createLayoutEnvironment(editor, anchor)
	const initialLayout = resolveCanvasPlanLayout(plan, environment)
	const initialBoxes = translateLayoutToAnchor(initialLayout.boxes, initialLayout.bounds, anchor)
	const createdShapeIDs: TLShapeId[] = []
	const historyMarkID = editor.markHistoryStoppingPoint(`canvas plan:${plan.planID}`)

	try {
		editor.run(() => {
			const shapes = plan.elements.map((element) =>
				createElementShape(plan, element, initialBoxes.get(element.id), planShapeIDs)
			)
			editor.createShapes(shapes)
			createdShapeIDs.push(...shapes.map(({ id }) => id).filter(isShapeID))

			const measuredSizes = measureCreatedElements(editor, plan, planShapeIDs)
			const measuredLayout = resolveCanvasPlanLayout(plan, environment, measuredSizes)
			const finalBoxes = translateLayoutToAnchor(
				measuredLayout.boxes,
				measuredLayout.bounds,
				anchor
			)
			positionCreatedElements(editor, plan, finalBoxes, planShapeIDs)
			applyPlanEdits(editor, plan, finalBoxes, planShapeIDs, environment)
			applyContainers(editor, plan, planShapeIDs, createdShapeIDs)

			for (const connector of plan.connectors) {
				const connectorID = createConnector(
					editor,
					plan,
					connector,
					planShapeIDs,
					environment
				)
				createdShapeIDs.push(connectorID)
			}

			applyLayers(editor, plan, planShapeIDs)
			applyDeletes(editor, plan, planShapeIDs)

			const survivingShapeIDs = createdShapeIDs.filter((id) => editor.getShape(id))
			if ((select ?? plan.selectCreated) && survivingShapeIDs.length) {
				editor.setSelectedShapes(survivingShapeIDs)
			}
			if (plan.zoomToFit && survivingShapeIDs.length) {
				const bounds = getShapeBounds(editor, survivingShapeIDs)
				if (bounds) editor.zoomToBounds(bounds, { animation: { duration: 200 }, inset: 80 })
			}
		})
	} catch (error) {
		editor.bailToMark(historyMarkID)
		throw error
	}

	return {
		planID: plan.planID,
		shapeIDs: createdShapeIDs.filter((id) => Boolean(editor.getShape(id))),
	}
}

function createPlanShapeIDs(plan: CanvasPlan) {
	const ids = new Map<string, TLShapeId>()
	for (const element of plan.elements) {
		ids.set(element.id, createShapeId(`${plan.planID}-${element.id}`))
	}
	for (const connector of plan.connectors) {
		ids.set(connector.id, createShapeId(`${plan.planID}-${connector.id}`))
	}
	for (const container of plan.containers) {
		if (container.type === 'group') {
			ids.set(container.id, createShapeId(`${plan.planID}-${container.id}`))
		}
	}
	return ids
}

function createElementShape(
	plan: CanvasPlan,
	element: CanvasPlanElement,
	box: CanvasLayoutBox | undefined,
	planShapeIDs: ReadonlyMap<string, TLShapeId>
): TLShapePartial {
	if (!box) throw new Error(`Missing layout for canvas element: ${element.id}`)
	const id = getPlanShapeID(planShapeIDs, element.id)
	const base = {
		id,
		x: box.x,
		y: box.y,
		rotation: degreesToRadians(element.rotation),
		isLocked: element.locked,
		...(element.style?.opacity !== undefined && { opacity: element.style.opacity }),
		meta: createPlanMetadata(plan, element.id),
	}

	if (element.kind === 'geo') {
		const shape: TLShapePartial<TLGeoShape> = {
			...base,
			type: 'geo',
			props: {
				w: box.w,
				h: box.h,
				geo: element.geo,
				richText: toRichText(element.text),
				...geoStyleProps(element.style),
			},
		}
		return shape
	}
	if (element.kind === 'text') {
		const shape: TLShapePartial<TLTextShape> = {
			...base,
			type: 'text',
			props: {
				w: box.w,
				richText: toRichText(element.text),
				autoSize: element.autoSize &&
					(element.size?.width === undefined || element.size.width === 'auto'),
				...textStyleProps(element.style),
			},
		}
		return shape
	}
	if (element.kind === 'note') {
		const shape: TLShapePartial<TLNoteShape> = {
			...base,
			type: 'note',
			props: {
				scale: box.w / NOTE_SIZE,
				richText: toRichText(element.text),
				...noteStyleProps(element.style),
			},
		}
		return shape
	}
	if (element.kind === 'equation') {
		const shape: TLShapePartial<CanvasMathShape> = {
			...base,
			type: MATH_SHAPE_TYPE,
			props: {
				w: box.w,
				h: box.h,
				latex: normalizeEquationLatex(element.latex),
				fontSize: element.fontSize,
				schemaVersion: 1,
			},
		}
		return shape
	}
	if (element.kind === 'frame') {
		const shape: TLShapePartial<TLFrameShape> = {
			...base,
			type: 'frame',
			props: {
				w: box.w,
				h: box.h,
				name: element.name,
				...(element.style?.color && { color: element.style.color }),
			},
		}
		return shape
	}

	const pointBounds = getPointBounds(element.points)
	const points = Object.fromEntries(element.points.map((point, index) => {
		const xScale = pointBounds.w === 0 ? 1 : box.w / pointBounds.w
		const yScale = pointBounds.h === 0 ? 1 : box.h / pointBounds.h
		const pointID = pointIndex(index)
		return [pointID, {
			id: pointID,
			index: pointID,
			x: (point.x - pointBounds.x) * xScale,
			y: (point.y - pointBounds.y) * yScale,
		}]
	}))
	const shape: TLShapePartial<TLLineShape> = {
		...base,
		type: 'line',
		props: {
			points,
			spline: element.spline,
			...lineStyleProps(element.style),
		},
	}
	return shape
}

function positionCreatedElements(
	editor: Editor,
	plan: CanvasPlan,
	boxes: ReadonlyMap<string, CanvasLayoutBox>,
	planShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	const updates = plan.elements.flatMap((element): TLShapePartial[] => {
		const id = getPlanShapeID(planShapeIDs, element.id)
		const shape = editor.getShape(id)
		const box = boxes.get(element.id)
		if (!shape || !box) return []
		if (shape.type === 'frame') {
			return [{ id, type: 'frame', x: box.x, y: box.y, props: { w: box.w, h: box.h } }]
		}
		return [{ id, type: shape.type, x: box.x, y: box.y }]
	})
	if (updates.length) editor.updateShapes(updates)
}

function createConnector(
	editor: Editor,
	plan: CanvasPlan,
	connector: CanvasConnector,
	planShapeIDs: ReadonlyMap<string, TLShapeId>,
	environment: CanvasLayoutEnvironment
) {
	const from = resolveEditorReference(editor, connector.from, planShapeIDs, environment)
	const to = resolveEditorReference(editor, connector.to, planShapeIDs, environment)
	if (!from || !to) throw new Error(`Connector ${connector.id} has an unavailable endpoint`)
	const startSide = resolveAttachmentSide(connector.fromSide, from.box, to.box)
	const endSide = resolveAttachmentSide(connector.toSide, to.box, from.box)
	const start = attachmentPoint(from.box, startSide)
	const end = attachmentPoint(to.box, endSide)
	const id = getPlanShapeID(planShapeIDs, connector.id)
	const route = connector.route === 'auto'
		? Math.abs(start.x - end.x) > 24 && Math.abs(start.y - end.y) > 24 ? 'elbow' : 'straight'
		: connector.route
	const shape: TLShapePartial<TLArrowShape> = {
		id,
		type: 'arrow',
		x: start.x,
		y: start.y,
		meta: createPlanMetadata(plan, connector.id),
		...(connector.style?.opacity !== undefined && { opacity: connector.style.opacity }),
		props: {
			start: { x: 0, y: 0 },
			end: { x: end.x - start.x, y: end.y - start.y },
			kind: route === 'elbow' ? 'elbow' : 'arc',
			bend: route === 'straight' ? 0 : route === 'curved' ? connector.bend || 40 : connector.bend,
			richText: toRichText(connector.label),
			arrowheadStart: connector.arrowheadStart,
			arrowheadEnd: connector.arrowheadEnd,
			...arrowStyleProps(connector.style),
		},
	}
	editor.createShape(shape)

	if (from.shapeIDs.length === 1) {
		editor.createBinding({
			type: 'arrow',
			fromId: id,
			toId: from.shapeIDs[0],
			props: {
				terminal: 'start',
				normalizedAnchor: normalizedAnchor(startSide),
				isPrecise: startSide !== 'center',
				isExact: false,
				snap: 'none',
			},
		})
	}
	if (to.shapeIDs.length === 1) {
		editor.createBinding({
			type: 'arrow',
			fromId: id,
			toId: to.shapeIDs[0],
			props: {
				terminal: 'end',
				normalizedAnchor: normalizedAnchor(endSide),
				isPrecise: endSide !== 'center',
				isExact: false,
				snap: 'none',
			},
		})
	}
	return id
}

function applyContainers(
	editor: Editor,
	plan: CanvasPlan,
	planShapeIDs: Map<string, TLShapeId>,
	createdShapeIDs: TLShapeId[]
) {
	for (const container of plan.containers) {
		if (container.type !== 'frame') continue
		const frameID = getPlanShapeID(planShapeIDs, container.frame)
		const childIDs = container.children.map((id) => getPlanShapeID(planShapeIDs, id))
		editor.reparentShapes(childIDs, frameID)
	}
	for (const container of plan.containers) {
		if (container.type !== 'group') continue
		const groupID = getPlanShapeID(planShapeIDs, container.id)
		const childIDs = container.children.map((id) => getPlanShapeID(planShapeIDs, id))
		editor.groupShapes(childIDs, { groupId: groupID, select: false })
		if (editor.getShape(groupID)) createdShapeIDs.push(groupID)
	}
}

function applyLayers(
	editor: Editor,
	plan: CanvasPlan,
	planShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	for (const layer of plan.layers) {
		const targetIDs = resolveReferenceShapeIDs(editor, layer.target, planShapeIDs)
		if (!targetIDs.length) throw new Error('A layer operation has no target shape')
		if (layer.operation === 'back') {
			editor.sendToBack(targetIDs)
			continue
		}
		if (layer.operation === 'front') {
			editor.bringToFront(targetIDs)
			continue
		}
		if (layer.operation === 'backward') {
			editor.sendBackward(targetIDs, { considerAllShapes: true })
			continue
		}
		if (layer.operation === 'forward') {
			editor.bringForward(targetIDs, { considerAllShapes: true })
			continue
		}
		if (!layer.relativeTo) continue
		const relativeIDs = resolveReferenceShapeIDs(editor, layer.relativeTo, planShapeIDs)
		if (!relativeIDs.length) throw new Error('A relative layer operation has no reference shape')
		moveRelativeLayer(editor, targetIDs, relativeIDs[0], layer.operation === 'behind')
	}
}

function moveRelativeLayer(
	editor: Editor,
	targetIDs: TLShapeId[],
	relativeID: TLShapeId,
	behind: boolean
) {
	const relative = editor.getShape(relativeID)
	if (!relative) return
	for (let step = 0; step < 100; step += 1) {
		const targets = targetIDs.map((id) => editor.getShape(id)).filter(isShape)
		if (!targets.length || targets.some(({ parentId }) => parentId !== relative.parentId)) return
		const isInPosition = behind
			? targets.every(({ index }) => index < relative.index)
			: targets.every(({ index }) => index > relative.index)
		if (isInPosition) return
		if (behind) editor.sendBackward(targetIDs, { considerAllShapes: true })
		else editor.bringForward(targetIDs, { considerAllShapes: true })
	}
}

function applyPlanEdits(
	editor: Editor,
	plan: CanvasPlan,
	finalBoxes: ReadonlyMap<string, CanvasLayoutBox>,
	planShapeIDs: ReadonlyMap<string, TLShapeId>,
	environment: CanvasLayoutEnvironment
) {
	for (const edit of plan.edits) {
		const targetIDs = resolveReferenceShapeIDs(editor, edit.target, planShapeIDs)
		if (!targetIDs.length) throw new Error('A canvas edit has no target shape')
		const targets = targetIDs.map((id) => {
			const shape = editor.getShape(id)
			if (!shape) throw new Error(`Canvas edit target does not exist: ${id}`)
			if (shape.isLocked) throw new Error(`Canvas edit target is locked: ${id}`)
			return shape
		})
		if (edit.placement) {
			const bounds = getShapeBounds(editor, targetIDs)
			const reference = resolveEditorReference(editor, edit.placement.of, planShapeIDs, environment)
			if (!bounds || !reference) throw new Error('Canvas edit placement cannot be resolved')
			const placed = resolveCanvasPlacement(bounds, edit.placement, reference.box)
			const deltaX = placed.x - bounds.x
			const deltaY = placed.y - bounds.y
			editor.updateShapes(targets.map((shape) => {
				const pageOrigin = editor.getShapePageTransform(shape)?.applyToPoint({ x: 0, y: 0 })
				const localPoint = pageOrigin
					? editor.getPointInParentSpace(shape, {
							x: pageOrigin.x + deltaX,
							y: pageOrigin.y + deltaY,
						})
					: { x: shape.x + deltaX, y: shape.y + deltaY }
				return {
					id: shape.id,
					type: shape.type,
					x: localPoint.x,
					y: localPoint.y,
				}
			}))
		}
		for (const shape of targets) {
			applyShapeEdit(editor, shape, edit, finalBoxes)
		}
	}
}

function applyShapeEdit(
	editor: Editor,
	shape: TLShape,
	edit: CanvasPlan['edits'][number],
	_finalBoxes: ReadonlyMap<string, CanvasLayoutBox>
) {
	const common = {
		id: shape.id,
		...(edit.rotation !== undefined && { rotation: degreesToRadians(edit.rotation) }),
		...(edit.locked !== undefined && { isLocked: edit.locked }),
		...(edit.style?.opacity !== undefined && { opacity: edit.style.opacity }),
	}
	if (shape.type === 'geo') {
		const size = resolveEditedSize(editor, shape, edit.size)
		editor.updateShape<TLGeoShape>({
			...common,
			type: 'geo',
			props: {
				...(size && { w: size.w, h: size.h }),
				...(edit.text !== undefined && { richText: toRichText(edit.text) }),
				...geoStyleProps(edit.style),
			},
		})
		return
	}
	if (shape.type === 'text') {
		const size = resolveEditedSize(editor, shape, edit.size)
		editor.updateShape<TLTextShape>({
			...common,
			type: 'text',
			props: {
				...(size && { w: size.w, autoSize: false }),
				...(edit.text !== undefined && { richText: toRichText(edit.text) }),
				...textStyleProps(edit.style),
			},
		})
		return
	}
	if (shape.type === 'note') {
		const size = resolveEditedSize(editor, shape, edit.size)
		editor.updateShape<TLNoteShape>({
			...common,
			type: 'note',
			props: {
				...(size && { scale: Math.max(size.w, size.h) / NOTE_SIZE }),
				...(edit.text !== undefined && { richText: toRichText(edit.text) }),
				...noteStyleProps(edit.style),
			},
		})
		return
	}
	if (shape.type === 'frame') {
		const size = resolveEditedSize(editor, shape, edit.size)
		editor.updateShape<TLFrameShape>({
			...common,
			type: 'frame',
			props: {
				...(size && { w: size.w, h: size.h }),
				...(edit.text !== undefined && { name: edit.text }),
				...(edit.style?.color && { color: edit.style.color }),
			},
		})
		return
	}
	if (shape.type === 'arrow') {
		editor.updateShape<TLArrowShape>({
			...common,
			type: 'arrow',
			props: {
				...(edit.text !== undefined && { richText: toRichText(edit.text) }),
				...arrowStyleProps(edit.style),
			},
		})
		return
	}
	if (shape.type === 'line') {
		editor.updateShape<TLLineShape>({
			...common,
			type: 'line',
			props: lineStyleProps(edit.style),
		})
		return
	}
	if (shape.type === MATH_SHAPE_TYPE) {
		const size = resolveEditedSize(editor, shape, edit.size)
		editor.updateShape<CanvasMathShape>({
			...common,
			type: MATH_SHAPE_TYPE,
			props: {
				...(size && { w: size.w, h: size.h }),
				...(edit.latex !== undefined && { latex: normalizeEquationLatex(edit.latex) }),
			},
		})
		return
	}
	editor.updateShape({ ...common, type: shape.type })
}

function applyDeletes(
	editor: Editor,
	plan: CanvasPlan,
	planShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	const ids = [...new Set(plan.deletes.flatMap((reference) =>
		resolveReferenceShapeIDs(editor, reference, planShapeIDs)
	))]
	for (const id of ids) {
		const shape = editor.getShape(id)
		if (shape?.isLocked) throw new Error(`Canvas delete target is locked: ${id}`)
	}
	if (ids.length) editor.deleteShapes(ids)
}

function validatePlanTargets(
	editor: Editor,
	plan: CanvasPlan,
	planShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	for (const [planID, shapeID] of planShapeIDs) {
		const shape = editor.getShape(shapeID)
		if (shape) throw new Error(`Canvas plan ID already belongs to another shape: ${planID}`)
	}
	for (const reference of [
		...plan.connectors.flatMap(({ from, to }) => [from, to]),
		...plan.edits.flatMap(({ target, placement }) => [
			target,
			...(placement ? [placement.of] : []),
		]),
		...plan.deletes,
		...plan.layers.flatMap(({ target, relativeTo }) => [
			target,
			...(relativeTo ? [relativeTo] : []),
		]),
	]) {
		if (reference.type === 'shape' &&
			(!isShapeId(reference.id) || !editor.getShape(reference.id))) {
			throw new Error(`Canvas plan references a missing shape: ${reference.id}`)
		}
	}
}

function createLayoutEnvironment(
	editor: Editor,
	cursor?: CanvasAnchor
): CanvasLayoutEnvironment {
	const viewport = editor.getViewportPageBounds()
	const shapes = editor.getCurrentPageShapesSorted()
	const references = new Map<string, CanvasLayoutReference>()
	const existing: Array<CanvasLayoutBox & { id: string }> = []
	for (const shape of shapes) {
		const bounds = editor.getShapePageBounds(shape)
		if (!bounds) continue
		const reference = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, ids: [shape.id] }
		references.set(shape.id, reference)
		existing.push({ ...reference, id: shape.id })
	}
	const selectionBounds = editor.getSelectionPageBounds()
	return {
		cursor,
		existing,
		selection: selectionBounds
			? {
					x: selectionBounds.x,
					y: selectionBounds.y,
					w: selectionBounds.w,
					h: selectionBounds.h,
					ids: [...editor.getSelectedShapeIds()],
				}
			: undefined,
		shapes: references,
		viewport: { x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h, ids: [] },
	}
}

function resolveEditorReference(
	editor: Editor,
	reference: CanvasObjectReference,
	planShapeIDs: ReadonlyMap<string, TLShapeId>,
	environment: CanvasLayoutEnvironment
): { box: CanvasLayoutReference; shapeIDs: TLShapeId[] } | undefined {
	if (reference.type === 'element') {
		const id = planShapeIDs.get(reference.id)
		const shape = id ? editor.getShape(id) : undefined
		const bounds = shape ? editor.getShapePageBounds(shape) : undefined
		return id && bounds
			? {
					box: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, ids: [id] },
					shapeIDs: [id],
				}
			: undefined
	}
	if (reference.type === 'shape') {
		if (!isShapeId(reference.id)) return undefined
		const id = reference.id
		const shape = editor.getShape(id)
		const bounds = shape ? editor.getShapePageBounds(shape) : undefined
		return bounds
			? {
					box: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, ids: [id] },
					shapeIDs: [id],
				}
			: undefined
	}
	if (reference.type === 'selection') {
		const ids = [...editor.getSelectedShapeIds()]
		const bounds = getShapeBounds(editor, ids)
		return bounds
			? { box: { ...bounds, ids }, shapeIDs: ids }
			: { box: environment.viewport, shapeIDs: [] }
	}
	if (reference.type === 'cursor') {
		const cursor = environment.cursor ?? {
			x: environment.viewport.x + environment.viewport.w / 2,
			y: environment.viewport.y + environment.viewport.h / 2,
		}
		return {
			box: { x: cursor.x, y: cursor.y, w: 0, h: 0, ids: [] },
			shapeIDs: [],
		}
	}
	return { box: environment.viewport, shapeIDs: [] }
}

function resolveReferenceShapeIDs(
	editor: Editor,
	reference: CanvasObjectReference,
	planShapeIDs: ReadonlyMap<string, TLShapeId>
): TLShapeId[] {
	if (reference.type === 'element') {
		const id = planShapeIDs.get(reference.id)
		return id && editor.getShape(id) ? [id] : []
	}
	if (reference.type === 'shape') {
		if (!isShapeId(reference.id)) return []
		const id = reference.id
		return editor.getShape(id) ? [id] : []
	}
	if (reference.type === 'selection') return [...editor.getSelectedShapeIds()]
	return []
}

function measureCreatedElements(
	editor: Editor,
	plan: CanvasPlan,
	planShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	const sizes = new Map<string, Pick<CanvasLayoutBox, 'w' | 'h'>>()
	for (const element of plan.elements) {
		const shape = editor.getShape(getPlanShapeID(planShapeIDs, element.id))
		const bounds = shape ? editor.getShapePageBounds(shape) : undefined
		if (bounds) sizes.set(element.id, { w: bounds.w, h: bounds.h })
	}
	return sizes
}

function translateLayoutToAnchor(
	boxes: ReadonlyMap<string, CanvasLayoutBox>,
	bounds: CanvasLayoutBox,
	anchor: CanvasAnchor | undefined
) {
	if (!anchor) return boxes
	const deltaX = anchor.x - bounds.x
	const deltaY = anchor.y - bounds.y
	return new Map([...boxes].map(([id, box]) => [
		id,
		{ ...box, x: box.x + deltaX, y: box.y + deltaY },
	]))
}

function getShapeBounds(editor: Editor, ids: readonly TLShapeId[]) {
	const boxes = ids.flatMap((id) => {
		const bounds = editor.getShapePageBounds(id)
		return bounds ? [bounds] : []
	})
	if (!boxes.length) return undefined
	return Box.Common(boxes)
}

function resolveEditedSize(
	editor: Editor,
	shape: TLShape,
	size: CanvasSize | undefined
) {
	if (!size) return undefined
	const bounds = editor.getShapePageBounds(shape)
	if (!bounds) return undefined
	const requestedWidth = size.width === 'auto' || size.width === 'fill' ? bounds.w : size.width
	const requestedHeight = size.height === 'auto' || size.height === 'fill' ? bounds.h : size.height
	let w = Math.max(size.minWidth ?? 1, Math.min(size.maxWidth ?? 10_000, requestedWidth))
	let h = Math.max(size.minHeight ?? 1, Math.min(size.maxHeight ?? 10_000, requestedHeight))
	if (size.aspectRatio) {
		if (w / h > size.aspectRatio) w = h * size.aspectRatio
		else h = w / size.aspectRatio
	}
	return { w, h }
}

function geoStyleProps(style: CanvasShapeStyle | undefined): Partial<TLGeoShape['props']> {
	return {
		...(style?.color && { color: style.color }),
		...(style?.labelColor && { labelColor: style.labelColor }),
		...(style?.fill && { fill: style.fill }),
		...(style?.dash && { dash: style.dash }),
		...(style?.size && { size: style.size }),
		...(style?.font && { font: style.font }),
		...(style?.textAlign && { align: style.textAlign }),
		...(style?.verticalAlign && { verticalAlign: style.verticalAlign }),
	}
}

function textStyleProps(style: CanvasShapeStyle | undefined): Partial<TLTextShape['props']> {
	return {
		...(style?.color && { color: style.color }),
		...(style?.size && { size: style.size }),
		...(style?.font && { font: style.font }),
		...(style?.textAlign && { textAlign: style.textAlign }),
	}
}

function noteStyleProps(style: CanvasShapeStyle | undefined): Partial<TLNoteShape['props']> {
	return {
		...(style?.color && { color: style.color }),
		...(style?.labelColor && { labelColor: style.labelColor }),
		...(style?.size && { size: style.size }),
		...(style?.font && { font: style.font }),
		...(style?.textAlign && { align: style.textAlign }),
		...(style?.verticalAlign && { verticalAlign: style.verticalAlign }),
	}
}

function lineStyleProps(style: CanvasShapeStyle | undefined): Partial<TLLineShape['props']> {
	return {
		...(style?.color && { color: style.color }),
		...(style?.dash && { dash: style.dash }),
		...(style?.size && { size: style.size }),
	}
}

function arrowStyleProps(style: CanvasShapeStyle | undefined): Partial<TLArrowShape['props']> {
	return {
		...(style?.color && { color: style.color }),
		...(style?.labelColor && { labelColor: style.labelColor }),
		...(style?.fill && { fill: style.fill }),
		...(style?.dash && { dash: style.dash }),
		...(style?.size && { size: style.size }),
		...(style?.font && { font: style.font }),
	}
}

function attachmentPoint(
	box: CanvasLayoutBox,
	side: 'north' | 'east' | 'south' | 'west' | 'center'
) {
	if (side === 'north') return { x: box.x + box.w / 2, y: box.y }
	if (side === 'east') return { x: box.x + box.w, y: box.y + box.h / 2 }
	if (side === 'south') return { x: box.x + box.w / 2, y: box.y + box.h }
	if (side === 'west') return { x: box.x, y: box.y + box.h / 2 }
	return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

function resolveAttachmentSide(
	side: CanvasConnector['fromSide'],
	origin: CanvasLayoutBox,
	target: CanvasLayoutBox
): 'north' | 'east' | 'south' | 'west' | 'center' {
	if (side !== 'auto') return side
	const deltaX = target.x + target.w / 2 - (origin.x + origin.w / 2)
	const deltaY = target.y + target.h / 2 - (origin.y + origin.h / 2)
	if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX >= 0 ? 'east' : 'west'
	return deltaY >= 0 ? 'south' : 'north'
}

function normalizedAnchor(
	side: 'north' | 'east' | 'south' | 'west' | 'center'
) {
	if (side === 'north') return { x: 0.5, y: 0 }
	if (side === 'east') return { x: 1, y: 0.5 }
	if (side === 'south') return { x: 0.5, y: 1 }
	if (side === 'west') return { x: 0, y: 0.5 }
	return { x: 0.5, y: 0.5 }
}

function getPointBounds(points: Array<{ x: number; y: number }>) {
	const x = Math.min(...points.map((point) => point.x))
	const y = Math.min(...points.map((point) => point.y))
	const right = Math.max(...points.map((point) => point.x))
	const bottom = Math.max(...points.map((point) => point.y))
	return { x, y, w: right - x, h: bottom - y }
}

function pointIndex(index: number) {
	let pointID = getIndexAbove()
	for (let current = 0; current < index; current += 1) pointID = getIndexAbove(pointID)
	return pointID
}

function createPlanMetadata(plan: CanvasPlan, elementID: string) {
	return {
		agentboard: {
			createdBy: 'study-agent',
			proposalType: 'canvas-plan',
			planID: plan.planID,
			elementID,
		},
	}
}

function findPlanShapes(
	editor: Editor,
	planShapeIDs: ReadonlyMap<string, TLShapeId>
) {
	return [...planShapeIDs.values()].flatMap((id) => {
		const shape = editor.getShape(id)
		return shape ? [shape] : []
	})
}

function getPlanShapeID(
	planShapeIDs: ReadonlyMap<string, TLShapeId>,
	planID: string
) {
	const id = planShapeIDs.get(planID)
	if (!id) throw new Error(`Missing shape ID for canvas plan element: ${planID}`)
	return id
}

function degreesToRadians(degrees: number) {
	return (degrees * Math.PI) / 180
}

function normalizeEquationLatex(latex: string) {
	let normalized = latex.trim()
	for (const [opening, closing] of [['$$', '$$'], ['$', '$'], ['\\[', '\\]'], ['\\(', '\\)']]) {
		if (normalized.length <= opening.length + closing.length) continue
		if (!normalized.startsWith(opening) || !normalized.endsWith(closing)) continue
		normalized = normalized.slice(opening.length, -closing.length).trim()
		break
	}
	return normalized.replace(/\\\\$/, '').trim()
}

function isShapeID(value: TLShapeId | undefined): value is TLShapeId {
	return value !== undefined
}

function isShape(value: TLShape | undefined): value is TLShape {
	return value !== undefined
}
