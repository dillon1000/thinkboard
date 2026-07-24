import { z } from 'zod'
import { CANVAS_CUSTOM_COLOR_NAMES } from './canvasColors'

export const CANVAS_PLAN_VERSION = 1 as const
export const MAX_CANVAS_PLAN_ELEMENTS = 60
export const MAX_CANVAS_PLAN_CONNECTORS = 80

export const canvasSpacingTokenSchema = z.enum(['xs', 'sm', 'md', 'lg', 'xl', 'xxl'])
export const canvasSpacingSchema = z.union([
	canvasSpacingTokenSchema,
	z.number().finite().min(0).max(2_000),
])

export const canvasPlanIDSchema = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const canvasColorSchema = z.enum([
	'black',
	'grey',
	'light-violet',
	'violet',
	'blue',
	'light-blue',
	'yellow',
	'orange',
	'green',
	'light-green',
	'light-red',
	'red',
	'white',
	...CANVAS_CUSTOM_COLOR_NAMES,
])

export const canvasObjectReferenceSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('element'), id: canvasPlanIDSchema }),
	z.object({ type: z.literal('shape'), id: z.string().trim().min(1).max(120) }),
	z.object({ type: z.literal('selection') }),
	z.object({ type: z.literal('viewport') }),
	z.object({ type: z.literal('cursor') }),
])

const canvasRelationSchema = z.enum([
	'north',
	'north-east',
	'east',
	'south-east',
	'south',
	'south-west',
	'west',
	'north-west',
	'center',
	'inside',
	'overlap',
])

export const canvasPlacementSchema = z.object({
	relation: canvasRelationSchema,
	of: canvasObjectReferenceSchema,
	gap: canvasSpacingSchema.default('md'),
	align: z.enum(['start', 'center', 'end']).default('center'),
	offset: z.object({
		x: z.number().finite().min(-10_000).max(10_000).default(0),
		y: z.number().finite().min(-10_000).max(10_000).default(0),
	}).default({ x: 0, y: 0 }),
})

const canvasSizeValueSchema = z.union([
	z.number().finite().positive().max(10_000),
	z.enum(['auto', 'fill']),
])

export const canvasSizeSchema = z.object({
	width: canvasSizeValueSchema.default('auto'),
	height: canvasSizeValueSchema.default('auto'),
	minWidth: z.number().finite().positive().max(10_000).optional(),
	maxWidth: z.number().finite().positive().max(10_000).optional(),
	minHeight: z.number().finite().positive().max(10_000).optional(),
	maxHeight: z.number().finite().positive().max(10_000).optional(),
	aspectRatio: z.number().finite().positive().max(100).optional(),
})

export const canvasShapeStyleSchema = z.object({
	color: canvasColorSchema.optional(),
	labelColor: canvasColorSchema.optional(),
	fill: z.enum(['none', 'semi', 'solid', 'pattern', 'fill', 'lined-fill']).optional(),
	dash: z.enum(['draw', 'solid', 'dashed', 'dotted']).optional(),
	size: z.enum(['s', 'm', 'l', 'xl']).optional(),
	font: z.enum(['draw', 'sans', 'serif', 'mono']).optional(),
	textAlign: z.enum(['start', 'middle', 'end']).optional(),
	verticalAlign: z.enum(['start', 'middle', 'end']).optional(),
	opacity: z.number().finite().min(0.05).max(1).optional(),
})

const CANVAS_GEOS = [
	'cloud',
	'rectangle',
	'ellipse',
	'triangle',
	'diamond',
	'pentagon',
	'hexagon',
	'octagon',
	'star',
	'rhombus',
	'rhombus-2',
	'oval',
	'trapezoid',
	'arrow-right',
	'arrow-left',
	'arrow-up',
	'arrow-down',
	'x-box',
	'check-box',
	'heart',
] as const
const canvasGeoSchema = z.enum(CANVAS_GEOS)

const canvasElementBaseSchema = {
	id: canvasPlanIDSchema,
	placement: canvasPlacementSchema.optional(),
	size: canvasSizeSchema.optional(),
	style: canvasShapeStyleSchema.optional(),
	rotation: z.number().finite().min(-360).max(360).default(0),
	locked: z.boolean().default(false),
}

export const canvasGeoElementSchema = z.object({
	...canvasElementBaseSchema,
	kind: z.literal('geo'),
	geo: canvasGeoSchema.default('rectangle'),
	text: z.string().trim().max(2_000).default(''),
})

export const canvasTextElementSchema = z.object({
	...canvasElementBaseSchema,
	kind: z.literal('text'),
	text: z.string().trim().min(1).max(4_000),
	autoSize: z.boolean().default(true),
})

export const canvasNoteElementSchema = z.object({
	...canvasElementBaseSchema,
	kind: z.literal('note'),
	text: z.string().trim().min(1).max(4_000),
})

export const canvasEquationElementSchema = z.object({
	...canvasElementBaseSchema,
	kind: z.literal('equation'),
	latex: z.string().trim().min(1).max(1_000),
	fontSize: z.number().finite().min(12).max(96).default(28),
})

export const canvasFrameElementSchema = z.object({
	...canvasElementBaseSchema,
	kind: z.literal('frame'),
	name: z.string().trim().min(1).max(120),
	padding: canvasSpacingSchema.default('lg'),
})

export const canvasLineElementSchema = z.object({
	...canvasElementBaseSchema,
	kind: z.literal('line'),
	points: z.array(z.object({
		x: z.number().finite().min(-10_000).max(10_000),
		y: z.number().finite().min(-10_000).max(10_000),
	})).min(2).max(20),
	spline: z.enum(['line', 'cubic']).default('line'),
})

export const canvasPlanElementSchema = z.discriminatedUnion('kind', [
	canvasGeoElementSchema,
	canvasTextElementSchema,
	canvasNoteElementSchema,
	canvasEquationElementSchema,
	canvasFrameElementSchema,
	canvasLineElementSchema,
])

const canvasLayoutBaseSchema = {
	id: canvasPlanIDSchema,
	items: z.array(canvasPlanIDSchema).min(1).max(MAX_CANVAS_PLAN_ELEMENTS),
	placement: canvasPlacementSchema.optional(),
}

export const canvasLayoutSchema = z.discriminatedUnion('type', [
	z.object({
		...canvasLayoutBaseSchema,
		type: z.literal('stack'),
		direction: z.enum(['north', 'east', 'south', 'west']).default('south'),
		gap: canvasSpacingSchema.default('md'),
		align: z.enum(['start', 'center', 'end']).default('start'),
	}),
	z.object({
		...canvasLayoutBaseSchema,
		type: z.literal('grid'),
		columns: z.number().int().min(1).max(12),
		columnGap: canvasSpacingSchema.default('md'),
		rowGap: canvasSpacingSchema.default('md'),
		align: z.enum(['start', 'center', 'end', 'stretch']).default('start'),
	}),
	z.object({
		...canvasLayoutBaseSchema,
		type: z.literal('radial'),
		radius: z.number().finite().positive().max(4_000).default(240),
		startAngle: z.number().finite().min(-360).max(360).default(-90),
	}),
	z.object({
		...canvasLayoutBaseSchema,
		type: z.literal('tree'),
		root: canvasPlanIDSchema,
		direction: z.enum(['north', 'east', 'south', 'west']).default('south'),
		levelGap: canvasSpacingSchema.default('xl'),
		siblingGap: canvasSpacingSchema.default('lg'),
	}),
])

export const canvasConnectorSchema = z.object({
	id: canvasPlanIDSchema,
	from: canvasObjectReferenceSchema,
	to: canvasObjectReferenceSchema,
	fromSide: z.enum(['auto', 'north', 'east', 'south', 'west', 'center']).default('auto'),
	toSide: z.enum(['auto', 'north', 'east', 'south', 'west', 'center']).default('auto'),
	label: z.string().trim().max(240).default(''),
	route: z.enum(['auto', 'straight', 'curved', 'elbow']).default('auto'),
	bend: z.number().finite().min(-500).max(500).default(0),
	arrowheadStart: z.enum(['arrow', 'triangle', 'square', 'dot', 'pipe', 'diamond', 'inverted', 'bar', 'none']).default('none'),
	arrowheadEnd: z.enum(['arrow', 'triangle', 'square', 'dot', 'pipe', 'diamond', 'inverted', 'bar', 'none']).default('arrow'),
	style: canvasShapeStyleSchema.optional(),
})

export const canvasContainerSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('frame'),
		frame: canvasPlanIDSchema,
		children: z.array(canvasPlanIDSchema).min(1).max(MAX_CANVAS_PLAN_ELEMENTS),
	}),
	z.object({
		type: z.literal('group'),
		id: canvasPlanIDSchema,
		children: z.array(canvasPlanIDSchema).min(2).max(MAX_CANVAS_PLAN_ELEMENTS),
	}),
])

export const canvasLayerSchema = z.object({
	target: canvasObjectReferenceSchema,
	operation: z.enum(['back', 'backward', 'forward', 'front', 'behind', 'in-front-of']),
	relativeTo: canvasObjectReferenceSchema.optional(),
}).superRefine((layer, context) => {
	const needsReference = layer.operation === 'behind' || layer.operation === 'in-front-of'
	if (needsReference && !layer.relativeTo) {
		context.addIssue({
			code: 'custom',
			message: `${layer.operation} requires relativeTo`,
			path: ['relativeTo'],
		})
	}
})

export const canvasEditSchema = z.object({
	target: canvasObjectReferenceSchema,
	placement: canvasPlacementSchema.optional(),
	size: canvasSizeSchema.optional(),
	style: canvasShapeStyleSchema.optional(),
	text: z.string().trim().max(4_000).optional(),
	latex: z.string().trim().max(1_000).optional(),
	rotation: z.number().finite().min(-360).max(360).optional(),
	locked: z.boolean().optional(),
})

export const canvasPlanSchema = z.object({
	version: z.literal(CANVAS_PLAN_VERSION),
	planID: canvasPlanIDSchema,
	baseDocumentClock: z.number().int().nonnegative().optional(),
	elements: z.array(canvasPlanElementSchema).max(MAX_CANVAS_PLAN_ELEMENTS).default([]),
	layouts: z.array(canvasLayoutSchema).max(20).default([]),
	connectors: z.array(canvasConnectorSchema).max(MAX_CANVAS_PLAN_CONNECTORS).default([]),
	containers: z.array(canvasContainerSchema).max(20).default([]),
	layers: z.array(canvasLayerSchema).max(40).default([]),
	edits: z.array(canvasEditSchema).max(40).default([]),
	deletes: z.array(canvasObjectReferenceSchema).max(30).default([]),
	collisionPolicy: z.enum(['shift', 'allow', 'error']).default('shift'),
	selectCreated: z.boolean().default(true),
	zoomToFit: z.boolean().default(false),
}).superRefine((plan, context) => {
	const elementIDs = new Set<string>()
	for (const [index, element] of plan.elements.entries()) {
		if (elementIDs.has(element.id)) {
			context.addIssue({
				code: 'custom',
				message: 'Element IDs must be unique',
				path: ['elements', index, 'id'],
			})
		}
		elementIDs.add(element.id)
	}

	const groupIDs = new Set(
		plan.containers.flatMap((container) => container.type === 'group' ? [container.id] : [])
	)
	for (const [index, container] of plan.containers.entries()) {
		if (container.type === 'group' && elementIDs.has(container.id)) {
			context.addIssue({
				code: 'custom',
				message: 'Group IDs must be unique across the plan',
				path: ['containers', index, 'id'],
			})
		}
	}

	const connectorIDs = new Set<string>()
	for (const [index, connector] of plan.connectors.entries()) {
		if (elementIDs.has(connector.id) || groupIDs.has(connector.id) || connectorIDs.has(connector.id)) {
			context.addIssue({
				code: 'custom',
				message: 'Connector IDs must be unique across the plan',
				path: ['connectors', index, 'id'],
			})
		}
		connectorIDs.add(connector.id)
	}

	const planReferences = new Set([...elementIDs, ...groupIDs, ...connectorIDs])
	const checkPlanReference = (
		reference: z.infer<typeof canvasObjectReferenceSchema>,
		path: Array<string | number>
	) => {
		if (reference.type === 'element' && !planReferences.has(reference.id)) {
			context.addIssue({
				code: 'custom',
				message: `Unknown plan element: ${reference.id}`,
				path,
			})
		}
	}

	for (const [index, element] of plan.elements.entries()) {
		if (element.placement) {
			checkPlanReference(element.placement.of, ['elements', index, 'placement', 'of'])
		}
	}
	for (const [index, connector] of plan.connectors.entries()) {
		checkPlanReference(connector.from, ['connectors', index, 'from'])
		checkPlanReference(connector.to, ['connectors', index, 'to'])
	}
	for (const [index, layout] of plan.layouts.entries()) {
		for (const [itemIndex, item] of layout.items.entries()) {
			if (!elementIDs.has(item)) {
				context.addIssue({
					code: 'custom',
					message: `Unknown layout item: ${item}`,
					path: ['layouts', index, 'items', itemIndex],
				})
			}
		}
		if (layout.type === 'tree' && !layout.items.includes(layout.root)) {
			context.addIssue({
				code: 'custom',
				message: 'The tree root must be one of its items',
				path: ['layouts', index, 'root'],
			})
		}
		if (layout.placement) {
			checkPlanReference(layout.placement.of, ['layouts', index, 'placement', 'of'])
		}
	}
	for (const [index, container] of plan.containers.entries()) {
		const containerID = container.type === 'frame' ? container.frame : container.id
		if (container.type === 'frame' && !elementIDs.has(container.frame)) {
			context.addIssue({
				code: 'custom',
				message: `Unknown frame: ${container.frame}`,
				path: ['containers', index, 'frame'],
			})
		}
		if (container.children.includes(containerID)) {
			context.addIssue({
				code: 'custom',
				message: 'A container cannot contain itself',
				path: ['containers', index, 'children'],
			})
		}
		for (const [childIndex, child] of container.children.entries()) {
			if (!elementIDs.has(child)) {
				context.addIssue({
					code: 'custom',
					message: `Unknown container child: ${child}`,
					path: ['containers', index, 'children', childIndex],
				})
			}
		}
	}

	if (
		plan.elements.length === 0 &&
		plan.connectors.length === 0 &&
		plan.edits.length === 0 &&
		plan.deletes.length === 0
	) {
		context.addIssue({
			code: 'custom',
			message: 'A canvas plan must change at least one board object',
			path: ['elements'],
		})
	}
})

const legacyCanvasStyleFields = {
	color: canvasColorSchema.optional(),
	dash: z.enum(['draw', 'solid', 'dashed', 'dotted']).optional(),
	fill: z.enum(['none', 'semi', 'solid', 'pattern', 'fill', 'lined-fill']).optional(),
	font: z.enum(['draw', 'sans', 'serif', 'mono']).optional(),
	size: z.enum(['s', 'm', 'l', 'xl']).optional(),
}

const legacyCanvasGeoSchema = z.object({
	id: canvasPlanIDSchema,
	type: z.literal('geo'),
	x: z.number().finite().min(-10_000).max(10_000),
	y: z.number().finite().min(-10_000).max(10_000),
	props: z.object({
		...legacyCanvasStyleFields,
		align: z.enum(['start', 'middle', 'end']).optional(),
		geo: canvasGeoSchema.default('rectangle'),
		h: z.number().finite().positive().max(10_000),
		text: z.string().max(4_000).default(''),
		w: z.number().finite().positive().max(10_000),
	}),
})

const legacyCanvasTextSchema = z.object({
	id: canvasPlanIDSchema,
	type: z.literal('text'),
	x: z.number().finite().min(-10_000).max(10_000),
	y: z.number().finite().min(-10_000).max(10_000),
	props: z.object({
		...legacyCanvasStyleFields,
		align: z.enum(['start', 'middle', 'end']).optional(),
		text: z.string().trim().min(1).max(4_000),
	}),
})

const legacyCanvasBindingSchema = z.object({
	type: z.literal('binding'),
	boundShapeId: z.string().trim().min(1).max(120),
})

const legacyCanvasArrowSchema = z.object({
	id: canvasPlanIDSchema,
	type: z.literal('arrow'),
	x: z.number().finite().min(-10_000).max(10_000).optional(),
	y: z.number().finite().min(-10_000).max(10_000).optional(),
	props: z.object({
		...legacyCanvasStyleFields,
		end: legacyCanvasBindingSchema,
		start: legacyCanvasBindingSchema,
		text: z.string().max(240).default(''),
	}),
})

const legacyCanvasPlanSchema = z.object({
	baseDocumentClock: z.number().int().nonnegative().optional(),
	create: z.array(z.discriminatedUnion('type', [
		legacyCanvasGeoSchema,
		legacyCanvasTextSchema,
		legacyCanvasArrowSchema,
	])).min(1).max(MAX_CANVAS_PLAN_ELEMENTS + MAX_CANVAS_PLAN_CONNECTORS),
	delete: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
})

/**
 * Accepts the compact native-shape call format that some Workers AI models emit, then converts
 * it into the validated layout plan used by the browser executor.
 */
export const canvasPlanInputSchema = z.union([canvasPlanSchema, legacyCanvasPlanSchema])

export function normalizeCanvasPlanInput(input: unknown): CanvasPlan {
	const current = canvasPlanSchema.safeParse(input)
	if (current.success) return current.data
	const legacy = legacyCanvasPlanSchema.parse(input)
	return canvasPlanSchema.parse(convertLegacyCanvasPlan(legacy))
}

function convertLegacyCanvasPlan(legacy: z.infer<typeof legacyCanvasPlanSchema>) {
	const nodes = legacy.create.filter(
		(shape): shape is Exclude<typeof shape, z.infer<typeof legacyCanvasArrowSchema>> =>
			shape.type !== 'arrow'
	)
	const arrows = legacy.create.filter(
		(shape): shape is z.infer<typeof legacyCanvasArrowSchema> => shape.type === 'arrow'
	)
	const boxes = nodes.map((shape) => ({ ...legacyShapeSize(shape), x: shape.x, y: shape.y }))
	const minX = Math.min(...boxes.map(({ x }) => x))
	const minY = Math.min(...boxes.map(({ y }) => y))
	const maxX = Math.max(...boxes.map(({ x, w }) => x + w))
	const maxY = Math.max(...boxes.map(({ y, h }) => y + h))
	const bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
	const nodeIDs = new Set(nodes.map(({ id }) => id))

	const elements = nodes.map((shape, index) => {
		const box = boxes[index]
		const placement = {
			align: 'center' as const,
			gap: 0,
			of: { type: 'viewport' as const },
			offset: {
				x: box.x - bounds.x - bounds.w / 2 + box.w / 2,
				y: box.y - bounds.y - bounds.h / 2 + box.h / 2,
			},
			relation: 'center' as const,
		}
		const style = legacyCanvasStyle(shape.props)
		const text = legacyHTMLToText(shape.props.text)
		return shape.type === 'geo'
			? {
					id: shape.id,
					kind: 'geo' as const,
					geo: shape.props.geo,
					placement,
					size: { width: box.w, height: box.h },
					...(style ? { style } : {}),
					text,
				}
			: {
					id: shape.id,
					kind: 'text' as const,
					autoSize: false,
					placement,
					size: { width: box.w, height: box.h },
					...(style ? { style } : {}),
					text,
				}
	})
	const connectors = arrows.map((arrow) => {
		const style = legacyCanvasStyle(arrow.props)
		return {
			id: arrow.id,
			from: legacyCanvasReference(arrow.props.start.boundShapeId, nodeIDs),
			to: legacyCanvasReference(arrow.props.end.boundShapeId, nodeIDs),
			label: legacyHTMLToText(arrow.props.text),
			...(style ? { style } : {}),
		}
	})

	return {
		version: CANVAS_PLAN_VERSION,
		planID: `legacy-${stableCanvasHash(JSON.stringify(legacy))}`,
		baseDocumentClock: legacy.baseDocumentClock,
		elements,
		connectors,
		deletes: legacy.delete.map((id) => ({
			type: 'shape' as const,
			id: id.startsWith('shape:') ? id : `shape:${id}`,
		})),
		collisionPolicy: 'allow',
		selectCreated: true,
		zoomToFit: true,
	}
}

function legacyShapeSize(
	shape: z.infer<typeof legacyCanvasGeoSchema> | z.infer<typeof legacyCanvasTextSchema>
) {
	if (shape.type === 'geo') return { w: shape.props.w, h: shape.props.h }
	const text = legacyHTMLToText(shape.props.text)
	const characterWidth = shape.props.size === 'xl' ? 14 : shape.props.size === 'l' ? 12 : 10
	return {
		w: Math.min(640, Math.max(120, text.length * characterWidth)),
		h: shape.props.size === 'xl' ? 56 : shape.props.size === 'l' ? 44 : 36,
	}
}

function legacyCanvasStyle(props: {
	align?: 'start' | 'middle' | 'end'
	color?: z.infer<typeof canvasColorSchema>
	dash?: 'draw' | 'solid' | 'dashed' | 'dotted'
	fill?: 'none' | 'semi' | 'solid' | 'pattern' | 'fill' | 'lined-fill'
	font?: 'draw' | 'sans' | 'serif' | 'mono'
	size?: 's' | 'm' | 'l' | 'xl'
}) {
	const style = {
		color: props.color,
		dash: props.dash,
		fill: props.fill,
		font: props.font,
		size: props.size,
		textAlign: props.align,
	}
	return Object.values(style).some((value) => value !== undefined) ? style : undefined
}

function legacyCanvasReference(id: string, nodeIDs: ReadonlySet<string>) {
	return nodeIDs.has(id)
		? { type: 'element' as const, id }
		: { type: 'shape' as const, id: id.startsWith('shape:') ? id : `shape:${id}` }
}

function legacyHTMLToText(html: string) {
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>\s*<p[^>]*>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim()
}

function stableCanvasHash(value: string) {
	let hash = 2_166_136_261
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16_777_619)
	}
	return (hash >>> 0).toString(36)
}

export type CanvasColor = z.infer<typeof canvasColorSchema>
export type CanvasConnector = z.infer<typeof canvasConnectorSchema>
export type CanvasContainer = z.infer<typeof canvasContainerSchema>
export type CanvasEdit = z.infer<typeof canvasEditSchema>
export type CanvasLayer = z.infer<typeof canvasLayerSchema>
export type CanvasLayout = z.infer<typeof canvasLayoutSchema>
export type CanvasObjectReference = z.infer<typeof canvasObjectReferenceSchema>
export type CanvasPlacement = z.infer<typeof canvasPlacementSchema>
export type CanvasPlan = z.infer<typeof canvasPlanSchema>
export type CanvasPlanInput = z.infer<typeof canvasPlanInputSchema>
export type CanvasPlanElement = z.infer<typeof canvasPlanElementSchema>
export type CanvasShapeStyle = z.infer<typeof canvasShapeStyleSchema>
export type CanvasSize = z.infer<typeof canvasSizeSchema>
export type CanvasSpacing = z.infer<typeof canvasSpacingSchema>
