import type {
	CanvasLayout,
	CanvasObjectReference,
	CanvasPlacement,
	CanvasPlan,
	CanvasPlanElement,
	CanvasSpacing,
} from '@agentboard/shared'
import { z } from 'zod'

export interface CanvasLayoutBox {
	h: number
	w: number
	x: number
	y: number
}

export interface CanvasLayoutReference extends CanvasLayoutBox {
	ids: string[]
}

export interface CanvasLayoutEnvironment {
	cursor?: { x: number; y: number }
	existing: Array<CanvasLayoutBox & { id: string }>
	selection?: CanvasLayoutReference
	shapes: ReadonlyMap<string, CanvasLayoutReference>
	viewport: CanvasLayoutReference
}

export interface ResolvedCanvasPlanLayout {
	boxes: ReadonlyMap<string, CanvasLayoutBox>
	bounds: CanvasLayoutBox
}

export const CANVAS_SPACING = {
	xs: 8,
	sm: 16,
	md: 24,
	lg: 40,
	xl: 64,
	xxl: 96,
} satisfies Readonly<Record<Exclude<CanvasSpacing, number>, number>>

const COLLISION_STEP = CANVAS_SPACING.md
const MAX_COLLISION_STEPS = 80
const canvasSpacingNameSchema = z.enum(['xs', 'sm', 'md', 'lg', 'xl', 'xxl'])

/**
 * Resolves a canvas plan in page coordinates. The function has no editor side effects, so the
 * same board snapshot and plan always produce the same geometry.
 */
export function resolveCanvasPlanLayout(
	plan: CanvasPlan,
	environment: CanvasLayoutEnvironment,
	measuredSizes: ReadonlyMap<string, Pick<CanvasLayoutBox, 'w' | 'h'>> = new Map()
): ResolvedCanvasPlanLayout {
	const boxes = new Map<string, CanvasLayoutBox>(
		plan.elements.map((element): [string, CanvasLayoutBox] => {
			const size = measuredSizes.get(element.id) ?? measureCanvasPlanElement(element)
			return [element.id, { h: size.h, w: size.w, x: 0, y: 0 }]
		})
	)
	const resolvedIDs = new Set<string>()

	for (const layout of plan.layouts) {
		arrangeLayout(layout, plan, boxes)
		const layoutBounds = getBounds(layout.items.flatMap((id) => {
			const box = boxes.get(id)
			return box ? [box] : []
		}))
		if (!layoutBounds) continue
		const placement = layout.placement ?? {
			align: 'center' as const,
			gap: 'md' as const,
			of: { type: 'viewport' as const },
			offset: { x: 0, y: 0 },
			relation: 'center' as const,
		}
		const target = resolveReference(placement.of, boxes, environment, resolvedIDs)
		if (target) {
			const placedBounds = placeBox(layoutBounds, placement, target)
			translateItems(
				layout.items,
				boxes,
				placedBounds.x - layoutBounds.x,
				placedBounds.y - layoutBounds.y
			)
			if (
				plan.collisionPolicy !== 'allow' &&
				(!layout.placement || !allowsOverlap(placement))
			) {
				resolveLayoutCollision(
					layout.items,
					boxes,
					[
						...environment.existing,
						...resolvedPlanObstacles(boxes, resolvedIDs),
					],
					new Set(target.ids),
					plan.collisionPolicy
				)
			}
		}
		for (const id of layout.items) resolvedIDs.add(id)
	}

	const unresolved = new Set(
		plan.elements
			.map(({ id }) => id)
			.filter((id) => !resolvedIDs.has(id))
	)
	for (let pass = 0; pass <= plan.elements.length && unresolved.size; pass += 1) {
		let progress = false
		for (const element of plan.elements) {
			if (!unresolved.has(element.id)) continue
			const box = boxes.get(element.id)
			if (!box) continue
			const placement = element.placement ?? defaultElementPlacement(element.id, plan.elements)
			const target = resolveReference(placement.of, boxes, environment, resolvedIDs)
			if (!target) continue
			const filledBox = fillElementBox(box, element, placement, target)
			boxes.set(element.id, placeBox(filledBox, placement, target))
			if (
				plan.collisionPolicy !== 'allow' &&
				(!element.placement || !allowsOverlap(placement))
			) {
				resolveElementCollision(
					element.id,
					boxes,
					[
						...environment.existing,
						...resolvedPlanObstacles(boxes, resolvedIDs),
					],
					new Set(target.ids),
					plan.collisionPolicy
				)
			}
			resolvedIDs.add(element.id)
			unresolved.delete(element.id)
			progress = true
		}
		if (!progress) break
	}

	if (unresolved.size) {
		throw new Error(`Canvas plan has unresolved placement references: ${[...unresolved].join(', ')}`)
	}

	fitFrameContainers(plan, boxes)

	const bounds = getBounds([...boxes.values()]) ?? {
		x: environment.viewport.x,
		y: environment.viewport.y,
		w: 0,
		h: 0,
	}

	return { boxes, bounds }
}

export function measureCanvasPlanElement(
	element: CanvasPlanElement
): Pick<CanvasLayoutBox, 'w' | 'h'> {
	const width = z.number().safeParse(element.size?.width)
	const height = z.number().safeParse(element.size?.height)
	const requestedWidth = width.success ? width.data : undefined
	const requestedHeight = height.success ? height.data : undefined
	let intrinsic: Pick<CanvasLayoutBox, 'w' | 'h'>

	if (element.kind === 'geo') {
		const width = requestedWidth ?? 280
		const textLines = estimateWrappedLines(element.text, width - 48, 10)
		intrinsic = { w: width, h: requestedHeight ?? Math.max(120, textLines * 28 + 48) }
	} else if (element.kind === 'text') {
		const width = requestedWidth ?? Math.min(520, Math.max(120, element.text.length * 10))
		const textLines = estimateWrappedLines(element.text, width, 9)
		intrinsic = { w: width, h: requestedHeight ?? Math.max(32, textLines * 28) }
	} else if (element.kind === 'note') {
		const side = Math.max(requestedWidth ?? 240, requestedHeight ?? 240)
		intrinsic = { w: side, h: side }
	} else if (element.kind === 'equation') {
		intrinsic = {
			w: requestedWidth ?? Math.min(1_200, Math.max(element.fontSize, element.latex.length * element.fontSize * 0.55)),
			h: requestedHeight ?? element.fontSize * 1.8,
		}
	} else if (element.kind === 'frame') {
		intrinsic = { w: requestedWidth ?? 640, h: requestedHeight ?? 420 }
	} else {
		const bounds = getPointBounds(element.points)
		intrinsic = {
			w: requestedWidth ?? Math.max(1, bounds.w),
			h: requestedHeight ?? Math.max(1, bounds.h),
		}
	}

	return constrainSize(intrinsic, element.size)
}

export function spacingValue(spacing: CanvasSpacing) {
	const numeric = z.number().safeParse(spacing)
	return numeric.success ? numeric.data : CANVAS_SPACING[canvasSpacingNameSchema.parse(spacing)]
}

export function resolveCanvasPlacement(
	box: CanvasLayoutBox,
	placement: CanvasPlacement,
	target: CanvasLayoutReference
) {
	return placeBox(box, placement, target)
}

function arrangeLayout(
	layout: CanvasLayout,
	plan: CanvasPlan,
	boxes: Map<string, CanvasLayoutBox>
) {
	if (layout.type === 'stack') {
		arrangeStack(layout, boxes)
		return
	}
	if (layout.type === 'grid') {
		arrangeGrid(layout, boxes)
		return
	}
	if (layout.type === 'radial') {
		arrangeRadial(layout, boxes)
		return
	}
	arrangeTree(layout, plan, boxes)
}

function arrangeStack(
	layout: Extract<CanvasLayout, { type: 'stack' }>,
	boxes: Map<string, CanvasLayoutBox>
) {
	const horizontal = layout.direction === 'east' || layout.direction === 'west'
	const orderedIDs = layout.direction === 'west' || layout.direction === 'north'
		? [...layout.items].reverse()
		: layout.items
	const crossSize = Math.max(0, ...orderedIDs.map((id) => {
		const box = boxes.get(id)
		return box ? horizontal ? box.h : box.w : 0
	}))
	let cursor = 0
	for (const id of orderedIDs) {
		const box = boxes.get(id)
		if (!box) continue
		const crossPosition = alignWithin(crossSize, horizontal ? box.h : box.w, layout.align)
		boxes.set(id, horizontal
			? { ...box, x: cursor, y: crossPosition }
			: { ...box, x: crossPosition, y: cursor })
		cursor += (horizontal ? box.w : box.h) + spacingValue(layout.gap)
	}
}

function arrangeGrid(
	layout: Extract<CanvasLayout, { type: 'grid' }>,
	boxes: Map<string, CanvasLayoutBox>
) {
	const rows = Array.from(
		{ length: Math.ceil(layout.items.length / layout.columns) },
		(_, index) => layout.items.slice(index * layout.columns, (index + 1) * layout.columns)
	)
	const columnWidths = Array.from({ length: layout.columns }, (_, column) =>
		Math.max(0, ...rows.map((row) => boxes.get(row[column])?.w ?? 0))
	)
	const rowHeights = rows.map((row) => Math.max(0, ...row.map((id) => boxes.get(id)?.h ?? 0)))
	const columnX = cumulativePositions(columnWidths, spacingValue(layout.columnGap))
	const rowY = cumulativePositions(rowHeights, spacingValue(layout.rowGap))

	for (const [rowIndex, row] of rows.entries()) {
		for (const [columnIndex, id] of row.entries()) {
			const box = boxes.get(id)
			if (!box) continue
			const cellWidth = columnWidths[columnIndex]
			const xOffset = layout.align === 'stretch'
				? 0
				: alignWithin(cellWidth, box.w, layout.align)
			const placed = {
				...box,
				x: columnX[columnIndex] + xOffset,
				y: rowY[rowIndex],
			}
			if (layout.align === 'stretch') placed.w = cellWidth
			boxes.set(id, placed)
		}
	}
}

function arrangeRadial(
	layout: Extract<CanvasLayout, { type: 'radial' }>,
	boxes: Map<string, CanvasLayoutBox>
) {
	const angleStep = 360 / layout.items.length
	for (const [index, id] of layout.items.entries()) {
		const box = boxes.get(id)
		if (!box) continue
		const angle = ((layout.startAngle + index * angleStep) * Math.PI) / 180
		boxes.set(id, {
			...box,
			x: Math.cos(angle) * layout.radius - box.w / 2,
			y: Math.sin(angle) * layout.radius - box.h / 2,
		})
	}
}

function arrangeTree(
	layout: Extract<CanvasLayout, { type: 'tree' }>,
	plan: CanvasPlan,
	boxes: Map<string, CanvasLayoutBox>
) {
	const itemIDs = new Set(layout.items)
	const children = new Map<string, string[]>()
	for (const connector of plan.connectors) {
		if (connector.from.type !== 'element' || connector.to.type !== 'element') continue
		if (!itemIDs.has(connector.from.id) || !itemIDs.has(connector.to.id)) continue
		const current = children.get(connector.from.id) ?? []
		current.push(connector.to.id)
		children.set(connector.from.id, current)
	}
	const levels: string[][] = []
	const visited = new Set<string>()
	let currentLevel = [layout.root]
	while (currentLevel.length) {
		const uniqueLevel = currentLevel.filter((id) => !visited.has(id))
		if (!uniqueLevel.length) break
		levels.push(uniqueLevel)
		for (const id of uniqueLevel) visited.add(id)
		currentLevel = uniqueLevel.flatMap((id) => children.get(id) ?? [])
	}
	const missing = layout.items.filter((id) => !visited.has(id))
	if (missing.length) levels.push(missing)

	const vertical = layout.direction === 'south' || layout.direction === 'north'
	const levelGap = spacingValue(layout.levelGap)
	const siblingGap = spacingValue(layout.siblingGap)
	let levelCursor = 0
	for (const level of levels) {
		const levelSizes = level.map((id) => boxes.get(id)).filter(isDefined)
		const mainSize = Math.max(0, ...levelSizes.map((box) => vertical ? box.h : box.w))
		const crossTotal = levelSizes.reduce(
			(total, box) => total + (vertical ? box.w : box.h),
			Math.max(0, levelSizes.length - 1) * siblingGap
		)
		let crossCursor = -crossTotal / 2
		for (const id of level) {
			const box = boxes.get(id)
			if (!box) continue
			const next = vertical
				? { ...box, x: crossCursor, y: levelCursor }
				: { ...box, x: levelCursor, y: crossCursor }
			boxes.set(id, next)
			crossCursor += (vertical ? box.w : box.h) + siblingGap
		}
		levelCursor += mainSize + levelGap
	}

	if (layout.direction === 'north' || layout.direction === 'west') {
		const bounds = getBounds(layout.items.flatMap((id) => {
			const box = boxes.get(id)
			return box ? [box] : []
		}))
		if (!bounds) return
		for (const id of layout.items) {
			const box = boxes.get(id)
			if (!box) continue
			boxes.set(id, vertical
				? { ...box, y: bounds.y + bounds.h - (box.y - bounds.y) - box.h }
				: { ...box, x: bounds.x + bounds.w - (box.x - bounds.x) - box.w })
		}
	}
}

function fitFrameContainers(plan: CanvasPlan, boxes: Map<string, CanvasLayoutBox>) {
	for (const container of plan.containers) {
		if (container.type !== 'frame') continue
		const frameElement = plan.elements.find(({ id }) => id === container.frame)
		if (frameElement?.kind !== 'frame') continue
		const childBounds = getBounds(container.children.flatMap((id) => {
			const box = boxes.get(id)
			return box ? [box] : []
		}))
		const frameBox = boxes.get(container.frame)
		if (!childBounds || !frameBox) continue
		const padding = spacingValue(frameElement.padding)
		const requiredWidth = childBounds.w + padding * 2
		const requiredHeight = childBounds.h + padding * 2
		const requestedWidth = z.number().safeParse(frameElement.size?.width)
		const requestedHeight = z.number().safeParse(frameElement.size?.height)
		const width = requestedWidth.success
			? Math.max(frameBox.w, requiredWidth)
			: requiredWidth
		const height = requestedHeight.success
			? Math.max(frameBox.h, requiredHeight)
			: requiredHeight
		boxes.set(container.frame, {
			x: childBounds.x - (width - childBounds.w) / 2,
			y: childBounds.y - (height - childBounds.h) / 2,
			w: width,
			h: height,
		})
	}
}

function resolveReference(
	reference: CanvasObjectReference,
	boxes: ReadonlyMap<string, CanvasLayoutBox>,
	environment: CanvasLayoutEnvironment,
	resolvedIDs: ReadonlySet<string>
): CanvasLayoutReference | undefined {
	if (reference.type === 'element') {
		if (!resolvedIDs.has(reference.id)) return undefined
		const box = boxes.get(reference.id)
		return box ? { ...box, ids: [reference.id] } : undefined
	}
	if (reference.type === 'shape') return environment.shapes.get(reference.id)
	if (reference.type === 'selection') return environment.selection ?? environment.viewport
	if (reference.type === 'cursor') {
		const cursor = environment.cursor ?? {
			x: environment.viewport.x + environment.viewport.w / 2,
			y: environment.viewport.y + environment.viewport.h / 2,
		}
		return { ...cursor, w: 0, h: 0, ids: [] }
	}
	return environment.viewport
}

function placeBox(
	box: CanvasLayoutBox,
	placement: CanvasPlacement,
	target: CanvasLayoutReference
): CanvasLayoutBox {
	const gap = spacingValue(placement.gap)
	const alignedX = target.x + alignWithin(target.w, box.w, placement.align)
	const alignedY = target.y + alignWithin(target.h, box.h, placement.align)
	let x = alignedX
	let y = alignedY

	if (placement.relation.includes('east')) x = target.x + target.w + gap
	if (placement.relation.includes('west')) x = target.x - box.w - gap
	if (placement.relation.includes('north')) y = target.y - box.h - gap
	if (placement.relation.includes('south')) y = target.y + target.h + gap

	if (placement.relation === 'east' || placement.relation === 'west') y = alignedY
	if (placement.relation === 'north' || placement.relation === 'south') x = alignedX
	if (
		placement.relation === 'center' ||
		placement.relation === 'overlap'
	) {
		x = target.x + (target.w - box.w) / 2
		y = target.y + (target.h - box.h) / 2
	}
	if (placement.relation === 'inside') {
		x = target.x + insidePosition(target.w, box.w, gap, placement.align)
		y = target.y + insidePosition(target.h, box.h, gap, placement.align)
	}

	return {
		...box,
		x: x + placement.offset.x,
		y: y + placement.offset.y,
	}
}

function defaultElementPlacement(id: string, elements: CanvasPlanElement[]): CanvasPlacement {
	const index = elements.findIndex((element) => element.id === id)
	return {
		relation: 'center',
		of: { type: 'viewport' },
		gap: 'md',
		align: 'center',
		offset: { x: index * CANVAS_SPACING.sm, y: index * CANVAS_SPACING.sm },
	}
}

function fillElementBox(
	box: CanvasLayoutBox,
	element: CanvasPlanElement,
	placement: CanvasPlacement,
	target: CanvasLayoutReference
) {
	const inset = placement.relation === 'inside' ? spacingValue(placement.gap) * 2 : 0
	const size = constrainSize({
		w: element.size?.width === 'fill' ? Math.max(1, target.w - inset) : box.w,
		h: element.size?.height === 'fill' ? Math.max(1, target.h - inset) : box.h,
	}, element.size)
	return { ...box, ...size }
}

function resolveElementCollision(
	id: string,
	boxes: Map<string, CanvasLayoutBox>,
	existing: Array<CanvasLayoutBox & { id: string }>,
	excludedIDs: ReadonlySet<string>,
	policy: CanvasPlan['collisionPolicy']
) {
	const box = boxes.get(id)
	if (!box) return
	const obstacles = existing.filter((obstacle) => !excludedIDs.has(obstacle.id))
	const resolved = findCollisionFreeBox(box, obstacles)
	if (!resolved && policy === 'error') throw new Error(`No collision-free position found for ${id}`)
	if (resolved) boxes.set(id, resolved)
}

function resolveLayoutCollision(
	ids: string[],
	boxes: Map<string, CanvasLayoutBox>,
	existing: Array<CanvasLayoutBox & { id: string }>,
	excludedIDs: ReadonlySet<string>,
	policy: CanvasPlan['collisionPolicy']
) {
	const currentBounds = getBounds(ids.flatMap((id) => {
		const box = boxes.get(id)
		return box ? [box] : []
	}))
	if (!currentBounds) return
	const obstacles = existing.filter((obstacle) => !excludedIDs.has(obstacle.id))
	const resolved = findCollisionFreeBox(currentBounds, obstacles)
	if (!resolved && policy === 'error') throw new Error('No collision-free position found for layout')
	if (resolved) translateItems(ids, boxes, resolved.x - currentBounds.x, resolved.y - currentBounds.y)
}

function findCollisionFreeBox(
	box: CanvasLayoutBox,
	obstacles: CanvasLayoutBox[]
): CanvasLayoutBox | undefined {
	if (!obstacles.some((obstacle) => boxesOverlap(box, obstacle))) return box
	for (let step = 1; step <= MAX_COLLISION_STEPS; step += 1) {
		const ring = Math.ceil(step / 4)
		const direction = step % 4
		const candidate = {
			...box,
			x: box.x + (direction === 1 ? ring : direction === 3 ? -ring : 0) * COLLISION_STEP,
			y: box.y + (direction === 2 ? ring : direction === 0 ? -ring : 0) * COLLISION_STEP,
		}
		if (!obstacles.some((obstacle) => boxesOverlap(candidate, obstacle))) return candidate
	}
	return undefined
}

function translateItems(
	ids: readonly string[],
	boxes: Map<string, CanvasLayoutBox>,
	deltaX: number,
	deltaY: number
) {
	for (const id of ids) {
		const box = boxes.get(id)
		if (box) boxes.set(id, { ...box, x: box.x + deltaX, y: box.y + deltaY })
	}
}

function resolvedPlanObstacles(
	boxes: ReadonlyMap<string, CanvasLayoutBox>,
	resolvedIDs: ReadonlySet<string>
) {
	return [...resolvedIDs].flatMap((id) => {
		const box = boxes.get(id)
		return box ? [{ ...box, id }] : []
	})
}

function constrainSize(
	size: Pick<CanvasLayoutBox, 'w' | 'h'>,
	constraints: CanvasPlanElement['size']
) {
	if (!constraints) return size
	let w = Math.max(constraints.minWidth ?? 1, Math.min(constraints.maxWidth ?? 10_000, size.w))
	let h = Math.max(constraints.minHeight ?? 1, Math.min(constraints.maxHeight ?? 10_000, size.h))
	if (constraints.aspectRatio) {
		if (w / h > constraints.aspectRatio) w = h * constraints.aspectRatio
		else h = w / constraints.aspectRatio
	}
	return { w, h }
}

function estimateWrappedLines(text: string, width: number, characterWidth: number) {
	const charactersPerLine = Math.max(1, Math.floor(width / characterWidth))
	return text.split('\n').reduce(
		(total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
		0
	)
}

function cumulativePositions(sizes: number[], gap: number) {
	let cursor = 0
	return sizes.map((size) => {
		const position = cursor
		cursor += size + gap
		return position
	})
}

function alignWithin(
	containerSize: number,
	itemSize: number,
	align: 'start' | 'center' | 'end' | 'stretch'
) {
	if (align === 'center') return (containerSize - itemSize) / 2
	if (align === 'end') return containerSize - itemSize
	return 0
}

function insidePosition(
	containerSize: number,
	itemSize: number,
	padding: number,
	align: 'start' | 'center' | 'end'
) {
	if (align === 'center') return (containerSize - itemSize) / 2
	if (align === 'end') return containerSize - itemSize - padding
	return padding
}

function getPointBounds(points: Array<{ x: number; y: number }>): CanvasLayoutBox {
	const minX = Math.min(...points.map(({ x }) => x))
	const minY = Math.min(...points.map(({ y }) => y))
	const maxX = Math.max(...points.map(({ x }) => x))
	const maxY = Math.max(...points.map(({ y }) => y))
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function getBounds(boxes: CanvasLayoutBox[]): CanvasLayoutBox | undefined {
	if (!boxes.length) return undefined
	const minX = Math.min(...boxes.map(({ x }) => x))
	const minY = Math.min(...boxes.map(({ y }) => y))
	const maxX = Math.max(...boxes.map(({ x, w }) => x + w))
	const maxY = Math.max(...boxes.map(({ y, h }) => y + h))
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function boxesOverlap(a: CanvasLayoutBox, b: CanvasLayoutBox) {
	const padding = CANVAS_SPACING.xs
	return a.x < b.x + b.w + padding &&
		a.x + a.w + padding > b.x &&
		a.y < b.y + b.h + padding &&
		a.y + a.h + padding > b.y
}

function allowsOverlap(placement: CanvasPlacement) {
	return placement.relation === 'center' ||
		placement.relation === 'inside' ||
		placement.relation === 'overlap'
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined
}
