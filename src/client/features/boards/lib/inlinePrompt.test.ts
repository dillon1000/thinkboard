import { Box, type Editor } from 'tldraw'
import { afterEach, describe, expect, it } from 'vitest'
import { closeInlinePrompt, getInlinePromptSession, openInlinePrompt } from './inlinePrompt'

interface EditorStub {
	pointer: { x: number; y: number }
	selection: Box | null
}

function createEditor({ pointer, selection }: EditorStub) {
	return {
		getSelectionPageBounds: () => selection,
		inputs: { currentPagePoint: pointer },
	} as unknown as Editor
}

afterEach(() => {
	closeInlinePrompt()
})

describe('openInlinePrompt', () => {
	it('anchors under the selection so the answer clears the student’s work', () => {
		const editor = createEditor({
			pointer: { x: 0, y: 0 },
			selection: new Box(120, 60, 200, 90),
		})

		openInlinePrompt(editor)

		expect(getInlinePromptSession()?.anchor).toEqual({ x: 120, y: 174 })
	})

	it('anchors at the pointer when nothing is selected', () => {
		const editor = createEditor({ pointer: { x: 42, y: -18 }, selection: null })

		openInlinePrompt(editor)

		expect(getInlinePromptSession()?.anchor).toEqual({ x: 42, y: -18 })
	})

	it('starts a fresh session on every invocation', () => {
		const editor = createEditor({ pointer: { x: 0, y: 0 }, selection: null })

		openInlinePrompt(editor)
		const first = getInlinePromptSession()?.sessionID
		openInlinePrompt(editor)

		expect(getInlinePromptSession()?.sessionID).not.toBe(first)
	})
})
