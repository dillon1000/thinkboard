import { describe, expect, it } from 'vitest'
import { canvasPlanSchema } from '@agentboard/shared'
import {
	resolveCanvasPlanLayout,
	type CanvasLayoutEnvironment,
} from './canvasPlanLayout'

const environment: CanvasLayoutEnvironment = {
	cursor: { x: 900, y: 500 },
	existing: [],
	selection: { x: 100, y: 100, w: 200, h: 100, ids: ['shape:selected'] },
	shapes: new Map([
		['shape:target', { x: 500, y: 100, w: 100, h: 100, ids: ['shape:target'] }],
	]),
	viewport: { x: 0, y: 0, w: 1_200, h: 800, ids: [] },
}

describe('resolveCanvasPlanLayout', () => {
	it('places elements relative to selection and other plan elements', () => {
		const plan = createPlan({
			elements: [
				{
					id: 'east-box',
					kind: 'geo',
					geo: 'rectangle',
					text: '',
					size: { width: 120, height: 80 },
					placement: {
						relation: 'east',
						of: { type: 'selection' },
						gap: 'md',
					},
				},
				{
					id: 'south-text',
					kind: 'text',
					text: 'Below',
					size: { width: 100, height: 40 },
					placement: {
						relation: 'south',
						of: { type: 'element', id: 'east-box' },
						gap: 'sm',
					},
				},
			],
		})

		const result = resolveCanvasPlanLayout(plan, environment)

		expect(result.boxes.get('east-box')).toMatchObject({ x: 324, y: 110, w: 120, h: 80 })
		expect(result.boxes.get('south-text')).toMatchObject({ x: 334, y: 206, w: 100, h: 40 })
	})

	it('lays out stacks and grids as one anchored unit', () => {
		const stackPlan = createPlan({
			elements: [
				{ id: 'one', kind: 'geo', geo: 'rectangle', text: '', size: { width: 100, height: 60 } },
				{ id: 'two', kind: 'geo', geo: 'rectangle', text: '', size: { width: 140, height: 80 } },
			],
			layouts: [{
				id: 'row',
				type: 'stack',
				items: ['one', 'two'],
				direction: 'east',
				gap: 'sm',
				align: 'center',
				placement: { relation: 'center', of: { type: 'viewport' } },
			}],
		})
		const gridPlan = createPlan({
			elements: [
				{ id: 'one', kind: 'geo', geo: 'rectangle', text: '', size: { width: 100, height: 50 } },
				{ id: 'two', kind: 'geo', geo: 'rectangle', text: '', size: { width: 120, height: 50 } },
				{ id: 'three', kind: 'geo', geo: 'rectangle', text: '', size: { width: 80, height: 50 } },
			],
			layouts: [{
				id: 'grid',
				type: 'grid',
				items: ['one', 'two', 'three'],
				columns: 2,
				columnGap: 'md',
				rowGap: 'sm',
				placement: { relation: 'center', of: { type: 'viewport' } },
			}],
		})

		const stack = resolveCanvasPlanLayout(stackPlan, environment)
		const grid = resolveCanvasPlanLayout(gridPlan, environment)

		expect(stack.bounds).toMatchObject({ x: 472, y: 360, w: 256, h: 80 })
		expect(grid.bounds.w).toBe(244)
		expect(grid.bounds.h).toBe(116)
		expect(grid.boxes.get('three')?.y).toBeGreaterThan(grid.boxes.get('one')?.y ?? 0)
	})

	it('fits frames around their children and resolves collisions', () => {
		const plan = createPlan({
			collisionPolicy: 'shift',
			elements: [
				{
					id: 'child',
					kind: 'geo',
					geo: 'rectangle',
					text: '',
					size: { width: 100, height: 80 },
					placement: { relation: 'east', of: { type: 'shape', id: 'shape:target' } },
				},
				{ id: 'frame', kind: 'frame', name: 'Section', padding: 'lg' },
			],
			containers: [{ type: 'frame', frame: 'frame', children: ['child'] }],
		})
		const collisionEnvironment = {
			...environment,
			existing: [{ id: 'shape:blocker', x: 620, y: 80, w: 180, h: 160 }],
		}

		const result = resolveCanvasPlanLayout(plan, collisionEnvironment)
		const child = result.boxes.get('child')
		const frame = result.boxes.get('frame')

		expect(child?.x).not.toBe(624)
		expect(frame?.w).toBe(180)
		expect(frame?.h).toBe(160)
		expect(frame?.x).toBe((child?.x ?? 0) - 40)
	})

	it('arranges tree levels from connector relationships', () => {
		const plan = createPlan({
			elements: [
				{ id: 'root', kind: 'geo', geo: 'rectangle', text: '', size: { width: 120, height: 60 } },
				{ id: 'left', kind: 'geo', geo: 'rectangle', text: '', size: { width: 100, height: 60 } },
				{ id: 'right', kind: 'geo', geo: 'rectangle', text: '', size: { width: 100, height: 60 } },
			],
			connectors: [
				{ id: 'root-left', from: { type: 'element', id: 'root' }, to: { type: 'element', id: 'left' } },
				{ id: 'root-right', from: { type: 'element', id: 'root' }, to: { type: 'element', id: 'right' } },
			],
			layouts: [{
				id: 'tree',
				type: 'tree',
				items: ['root', 'left', 'right'],
				root: 'root',
				direction: 'south',
				placement: { relation: 'center', of: { type: 'viewport' } },
			}],
		})

		const result = resolveCanvasPlanLayout(plan, environment)

		expect(result.boxes.get('left')?.y).toBeGreaterThan(result.boxes.get('root')?.y ?? 0)
		expect(result.boxes.get('left')?.x).toBeLessThan(result.boxes.get('right')?.x ?? 0)
	})
})

function createPlan(overrides: Record<string, unknown>) {
	return canvasPlanSchema.parse({
		version: 1,
		planID: 'test-plan',
		collisionPolicy: 'allow',
		...overrides,
	})
}
