import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
	Editor,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
} from 'tldraw'
import { applyCanvasPlan } from './canvasPlanApply'

describe('applyCanvasPlan', () => {
	it('creates native shapes and bound connectors without duplicating a retried plan', () => {
		const harness = createEditorHarness()
		const plan = {
			version: 1,
			planID: 'native-map',
			elements: [
				{
					id: 'source',
					kind: 'geo',
					geo: 'rectangle',
					text: 'Source',
					size: { width: 180, height: 100 },
				},
				{
					id: 'target',
					kind: 'geo',
					geo: 'ellipse',
					text: 'Target',
					size: { width: 180, height: 100 },
				},
			],
			layouts: [{
				id: 'row',
				type: 'stack',
				items: ['source', 'target'],
				direction: 'east',
				gap: 'lg',
				placement: { relation: 'center', of: { type: 'viewport' } },
			}],
			connectors: [{
				id: 'edge',
				from: { type: 'element', id: 'source' },
				to: { type: 'element', id: 'target' },
				label: 'leads to',
			}],
		}

		const first = applyCanvasPlan(harness.editor, plan)
		const second = applyCanvasPlan(harness.editor, plan)

		expect(first.shapeIDs).toHaveLength(3)
		expect(second.shapeIDs).toHaveLength(3)
		expect(harness.shapes).toHaveLength(3)
		expect(harness.bindings).toHaveLength(2)
		expect(harness.selected).toEqual(expect.arrayContaining(first.shapeIDs))
		expect(harness.shapes.find(({ type }) => type === 'geo')?.meta).toMatchObject({
			agentboard: { planID: 'native-map' },
		})
	})

	it('rejects stale plans before it changes the editor', () => {
		const harness = createEditorHarness()

		const stalePlan = {
			version: 1,
			planID: 'stale-plan',
			baseDocumentClock: 10,
			elements: [{ id: 'note', kind: 'note', text: 'Old context' }],
		}
		expect(() => applyCanvasPlan(harness.editor, stalePlan, {
			documentClock: 11,
		})).toThrow('The space changed')
		expect(harness.shapes).toHaveLength(0)
	})
})

interface MockShape {
	id: TLShapeId
	index: string
	isLocked: boolean
	meta: object
	opacity: number
	parentId: string
	props: object
	rotation: number
	type: string
	x: number
	y: number
}

type MockBinding = Parameters<Editor['createBinding']>[0]

const mockDimensionsSchema = z.object({
	h: z.number().optional(),
	scale: z.number().optional(),
	w: z.number().optional(),
})

function createEditorHarness() {
	const shapes: MockShape[] = []
	const bindings: MockBinding[] = []
	let selected: TLShapeId[] = []

	const getShape = (value: TLShapeId | TLShape) => {
		const parsedShape = z.object({ id: z.string() }).safeParse(value)
		const id = parsedShape.success ? parsedShape.data.id : z.string().parse(value)
		return shapes.find((shape) => shape.id === id)
	}
	const getBounds = (value: TLShapeId | TLShape) => {
		const shape = getShape(value)
		if (!shape) return undefined
		const dimensions = mockDimensionsSchema.parse(shape.props)
		const scale = dimensions.scale ?? 1
		const w = dimensions.w !== undefined
			? dimensions.w
			: shape.type === 'note' ? 200 * scale : 100
		const h = dimensions.h !== undefined
			? dimensions.h
			: shape.type === 'note' ? 200 * scale : shape.type === 'text' ? 40 : 100
		return { x: shape.x, y: shape.y, w, h }
	}
	const putShape = (partial: TLShapePartial) => {
		const existing = shapes.find((shape) => shape.id === partial.id)
		if (existing) {
			if (partial.x !== undefined) existing.x = partial.x
			if (partial.y !== undefined) existing.y = partial.y
			if (partial.rotation !== undefined) existing.rotation = partial.rotation
			if (partial.isLocked !== undefined) existing.isLocked = partial.isLocked
			if (partial.opacity !== undefined) existing.opacity = partial.opacity
			if (partial.props) existing.props = { ...existing.props, ...partial.props }
			return
		}
		shapes.push({
			id: partial.id,
			type: partial.type,
			x: partial.x ?? 0,
			y: partial.y ?? 0,
			rotation: partial.rotation ?? 0,
			index: `a${shapes.length + 1}`,
			parentId: 'page:page',
			isLocked: partial.isLocked ?? false,
			opacity: partial.opacity ?? 1,
			props: { ...partial.props },
			meta: { ...partial.meta },
		})
	}

	const editorFixture = {
		bailToMark: () => undefined,
		bringForward: () => undefined,
		bringToFront: () => undefined,
		createBinding: (binding: MockBinding) => {
			bindings.push(binding)
		},
		createShape: putShape,
		createShapes: (partials: TLShapePartial[]) => {
			for (const partial of partials) putShape(partial)
		},
		deleteShapes: (ids: TLShapeId[]) => {
			for (const id of ids) {
				const index = shapes.findIndex((shape) => shape.id === id)
				if (index >= 0) shapes.splice(index, 1)
			}
		},
		getCurrentPageShapesSorted: () => shapes,
		getSelectedShapeIds: () => selected,
		getSelectionPageBounds: () => undefined,
		getShape,
		getShapePageBounds: getBounds,
		getViewportPageBounds: () => ({ x: 0, y: 0, w: 1_000, h: 700 }),
		groupShapes: () => undefined,
		markHistoryStoppingPoint: () => 'mark:test',
		reparentShapes: () => undefined,
		run: (operation: () => void) => operation(),
		sendBackward: () => undefined,
		sendToBack: () => undefined,
		setSelectedShapes: (ids: TLShapeId[]) => {
			selected = ids
		},
		updateShape: putShape,
		updateShapes: (partials: TLShapePartial[]) => {
			for (const partial of partials) putShape(partial)
		},
		zoomToBounds: () => undefined,
	}
	// SAFETY: The fixture implements every Editor method that applyCanvasPlan calls.
	const editor = Object.assign(Object.create(Editor.prototype), editorFixture) as Editor

	return {
		editor,
		bindings,
		shapes,
		get selected() {
			return selected
		},
	}
}
