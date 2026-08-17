import { createShapeId } from 'tldraw'
import type { CanvasRecordSnapshot } from '@agentboard/shared'
import { describe, expect, it } from 'vitest'
import { assertRecordsUnchanged, createAgentAction } from './agentActionLedger'

describe('createAgentAction', () => {
	it('stores only created, changed, and deleted canvas records', () => {
		const kept: CanvasRecordSnapshot = { id: createShapeId('kept'), typeName: 'shape', type: 'note', x: 0 }
		const changed: CanvasRecordSnapshot = { id: createShapeId('changed'), typeName: 'shape', type: 'note', x: 0 }
		const removed: CanvasRecordSnapshot = { id: createShapeId('removed'), typeName: 'shape', type: 'note', x: 0 }
		const created: CanvasRecordSnapshot = { id: createShapeId('created'), typeName: 'shape', type: 'note', x: 4 }
		const action = createAgentAction(
			[kept, changed, removed],
			[kept, { ...changed, x: 2 }, created],
			{ toolName: 'composeCanvas' }
		)

		expect(action?.recordIDs).toEqual([changed.id, removed.id, created.id])
		expect(action?.beforeRecords).toHaveLength(2)
		expect(action?.afterRecords).toHaveLength(2)
	})

	it('rejects undo when an affected record has changed', () => {
		const id = createShapeId('changed')
		const after: CanvasRecordSnapshot = { id, typeName: 'shape', type: 'note', x: 2 }
		const editor = {
			store: {
				get: () => ({ ...after, x: 3 }),
			},
		}

		expect(() => assertRecordsUnchanged(editor, [], [after])).toThrow(
			'changed after this AI action'
		)
	})
})
