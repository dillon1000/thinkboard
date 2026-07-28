import { describe, expect, it } from 'vitest'
import { createCraftElementDiff } from './craftWhiteboardCanvas'

describe('createCraftElementDiff', () => {
	it('separates adds, updates, deletes, and unchanged Craft IDs', async () => {
		const diff = await createCraftElementDiff([
			{ id: 'unchanged', type: 'rectangle', x: 0 },
			{ id: 'updated', type: 'text', text: 'Before' },
			{ id: 'deleted', type: 'ellipse' },
		], [
			{ id: 'unchanged', type: 'rectangle', x: 0 },
			{ id: 'updated', type: 'text', text: 'After' },
			{ id: 'added', type: 'freedraw', points: [[0, 0], [10, 10]] },
		])

		expect(diff).toEqual({
			elementIDsToDelete: ['deleted'],
			elementsToAdd: [{
				id: 'added',
				points: [[0, 0], [10, 10]],
				type: 'freedraw',
			}],
			elementsToUpdate: [{
				id: 'updated',
				text: 'After',
				type: 'text',
			}],
		})
	})
})
