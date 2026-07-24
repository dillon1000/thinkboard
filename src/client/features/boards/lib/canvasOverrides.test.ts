import type { Editor, TLUiActionItem } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { canvasOverrides } from './canvasOverrides'

function overrideActions(actions: Record<string, TLUiActionItem>) {
	const editor = {} as Editor
	return canvasOverrides.actions?.(editor, actions, {} as never) ?? actions
}

describe('canvasOverrides actions', () => {
	it('takes cmd+I from tldraw’s embed dialog so only the inline agent answers it', () => {
		const result = overrideActions({
			'insert-embed': { id: 'insert-embed', kbd: 'cmd+i,ctrl+i', onSelect: () => undefined },
		})

		expect(result['insert-embed'].kbd).toBeUndefined()
		expect(result['inline-prompt'].kbd).toBe('$i')
	})

	it('leaves the embed action otherwise intact so its menu entry still works', () => {
		const onSelect = () => undefined
		const result = overrideActions({
			'insert-embed': { id: 'insert-embed', kbd: 'cmd+i,ctrl+i', label: 'action.insert-embed', onSelect },
		})

		expect(result['insert-embed']).toMatchObject({
			id: 'insert-embed',
			label: 'action.insert-embed',
			onSelect,
		})
	})

	it('adds the inline agent even when tldraw drops the embed action', () => {
		const result = overrideActions({})

		expect(result['inline-prompt'].kbd).toBe('$i')
	})
})
