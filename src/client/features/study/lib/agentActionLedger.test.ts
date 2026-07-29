import { createShapeId, type Editor } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { assertRecordsUnchanged, createAgentAction } from './agentActionLedger'

describe('createAgentAction', () => {
	it('stores only created, changed, and deleted canvas records', () => {
		const kept = { id: createShapeId('kept'), typeName: 'shape' as const, type: 'note', x: 0 }
		const changed = { id: createShapeId('changed'), typeName: 'shape' as const, type: 'note', x: 0 }
		const removed = { id: createShapeId('removed'), typeName: 'shape' as const, type: 'note', x: 0 }
		const created = { id: createShapeId('created'), typeName: 'shape' as const, type: 'note', x: 4 }
		const action = createAgentAction(
			[kept, changed, removed] as never,
			[kept, { ...changed, x: 2 }, created] as never,
			{ toolName: 'composeCanvas' }
		)

		expect(action?.recordIDs).toEqual([changed.id, removed.id, created.id])
		expect(action?.beforeRecords).toHaveLength(2)
		expect(action?.afterRecords).toHaveLength(2)
	})

	it('rejects undo when an affected record has changed', () => {
		const id = createShapeId('changed')
		const after = { id, typeName: 'shape' as const, type: 'note', x: 2 }
		const editor = {
			store: {
				get: () => ({ ...after, x: 3 }),
			},
		} as unknown as Editor

		expect(() => assertRecordsUnchanged(editor, [], [after] as never)).toThrow(
			'changed after this AI action'
		)
	})
})
