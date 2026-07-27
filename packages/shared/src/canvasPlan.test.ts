import { describe, expect, it } from 'vitest'
import {
	canvasPlanInputSchema,
	canvasPlanSchema,
	normalizeCanvasPlanInput,
} from './canvasPlan'

describe('canvasPlanSchema', () => {
	it('accepts native shapes, layouts, connectors, containers, edits, and layers', () => {
		const result = canvasPlanSchema.parse({
			version: 1,
			planID: 'photosynthesis-map',
			baseDocumentClock: 14,
			elements: [
				{
					id: 'reaction',
					kind: 'equation',
					latex: '6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2',
					placement: {
						relation: 'east',
						of: { type: 'selection' },
						gap: 'lg',
					},
				},
				{
					id: 'explanation',
					kind: 'geo',
					geo: 'rectangle',
					text: 'Light energy drives the reaction.',
					style: { color: 'agent-blue', fill: 'semi' },
				},
				{
					id: 'section',
					kind: 'frame',
					name: 'Photosynthesis',
					size: { width: 720, height: 460 },
				},
			],
			layouts: [{
				id: 'content-row',
				type: 'stack',
				items: ['reaction', 'explanation'],
				direction: 'east',
				gap: 'md',
				placement: {
					relation: 'center',
					of: { type: 'viewport' },
				},
			}],
			connectors: [{
				id: 'reaction-explanation',
				from: { type: 'element', id: 'reaction' },
				to: { type: 'element', id: 'explanation' },
				route: 'elbow',
				label: 'produces',
			}],
			containers: [{
				type: 'frame',
				frame: 'section',
				children: ['reaction', 'explanation'],
			}],
			layers: [{
				target: { type: 'element', id: 'section' },
				operation: 'behind',
				relativeTo: { type: 'element', id: 'reaction' },
			}],
			edits: [{
				target: { type: 'selection' },
				style: { opacity: 0.8 },
			}],
		})

		expect(result.elements).toHaveLength(3)
		expect(result.connectors[0].arrowheadEnd).toBe('arrow')
		expect(result.layouts[0].type).toBe('stack')
		expect(result.collisionPolicy).toBe('shift')
	})

	it('rejects duplicate and missing plan references', () => {
		const result = canvasPlanSchema.safeParse({
			version: 1,
			planID: 'bad-plan',
			elements: [
				{ id: 'same', kind: 'text', text: 'One' },
				{ id: 'same', kind: 'text', text: 'Two' },
			],
			connectors: [{
				id: 'edge',
				from: { type: 'element', id: 'same' },
				to: { type: 'element', id: 'missing' },
			}],
		})

		expect(result.success).toBe(false)
		if (result.success) return
		expect(result.error.issues.map(({ message }) => message)).toEqual(expect.arrayContaining([
			'Element IDs must be unique',
			'Unknown plan element: missing',
		]))
	})

	it('requires a relative layer reference and at least one board change', () => {
		const layerResult = canvasPlanSchema.safeParse({
			version: 1,
			planID: 'bad-layer',
			elements: [{ id: 'box', kind: 'geo' }],
			layers: [{
				target: { type: 'element', id: 'box' },
				operation: 'behind',
			}],
		})
		const emptyResult = canvasPlanSchema.safeParse({
			version: 1,
			planID: 'empty-plan',
		})

		expect(layerResult.success).toBe(false)
		expect(emptyResult.success).toBe(false)
	})

	it('defaults a missing version on a current canvas plan', () => {
		const input = {
			planID: 'deposit-check-reminder',
			baseDocumentClock: 72,
			elements: [{
				id: 'deposit-check-note',
				kind: 'note',
				text: 'Deposit tuition check before work',
				style: {
					color: 'agent-amber',
					fill: 'semi',
					font: 'sans',
					size: 'm',
				},
				placement: {
					relation: 'south',
					of: { type: 'shape', id: 'existing-shape' },
					gap: 'lg',
					align: 'start',
				},
			}],
		}

		expect(canvasPlanInputSchema.parse(input)).toMatchObject({
			version: 1,
			planID: input.planID,
			baseDocumentClock: input.baseDocumentClock,
			elements: input.elements,
		})
		expect(normalizeCanvasPlanInput(input).version).toBe(1)
	})

	it('converts validated native-shape calls into a layout plan', () => {
		const input = {
			baseDocumentClock: 4,
			delete: ['old-shape'],
			create: [
				{
					id: 'first',
					type: 'geo',
					x: 100,
					y: 200,
					props: {
						geo: 'rectangle',
						w: 240,
						h: 80,
						color: 'agent-blue',
						fill: 'solid',
						text: '<p><strong>First step</strong></p>',
					},
				},
				{
					id: 'second',
					type: 'geo',
					x: 100,
					y: 340,
					props: {
						geo: 'diamond',
						w: 240,
						h: 100,
						color: 'agent-amber',
						fill: 'solid',
						text: '<p>Continue?</p>',
					},
				},
				{
					id: 'edge',
					type: 'arrow',
					props: {
						color: 'black',
						start: { type: 'binding', boundShapeId: 'first' },
						end: { type: 'binding', boundShapeId: 'second' },
					},
				},
			],
		}
		expect(canvasPlanInputSchema.safeParse(input).success).toBe(true)
		const result = normalizeCanvasPlanInput(input)

		expect(result).toMatchObject({
			version: 1,
			baseDocumentClock: 4,
			collisionPolicy: 'allow',
			elements: [
				{ id: 'first', kind: 'geo', text: 'First step' },
				{ id: 'second', kind: 'geo', text: 'Continue?' },
			],
			connectors: [{
				id: 'edge',
				from: { type: 'element', id: 'first' },
				to: { type: 'element', id: 'second' },
			}],
			deletes: [{ type: 'shape', id: 'shape:old-shape' }],
		})
		expect(result.planID).toMatch(/^legacy-[a-z0-9]+$/)
	})

	it('rejects unsupported raw canvas records', () => {
		expect(canvasPlanInputSchema.safeParse({
			create: [{
				id: 'freehand',
				type: 'draw',
				x: 0,
				y: 0,
				props: { segments: [] },
			}],
		}).success).toBe(false)
	})
})
