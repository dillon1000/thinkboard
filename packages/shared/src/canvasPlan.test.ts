import { describe, expect, it } from 'vitest'
import { canvasPlanSchema } from './canvasPlan'

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
})
