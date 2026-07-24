import type { TLUiOverrides } from 'tldraw'
import { MathShapeTool } from '../shapes/MathShapeTool'
import { openInlinePrompt } from './inlinePrompt'

export const canvasTools = [MathShapeTool] as const

/** tldraw's own embed action, whose default cmd+I binding the inline agent takes over. */
const INSERT_EMBED_ACTION_ID = 'insert-embed'

/** Registers the equation tool with the UI so the rail and keyboard shortcuts can reach it. */
export const canvasOverrides: TLUiOverrides = {
	actions(editor, actions) {
		// tldraw binds cmd+I to its embed dialog, and every action carrying a kbd is registered, so
		// leaving it in place would fire both. Embedding keeps its menu entry and loses the
		// shortcut: reaching the agent from wherever the cursor is earns the keystroke here.
		if (actions[INSERT_EMBED_ACTION_ID]) {
			actions[INSERT_EMBED_ACTION_ID] = { ...actions[INSERT_EMBED_ACTION_ID], kbd: undefined }
		}
		// Canvas keystrokes are tldraw's to dispatch, so cmd+I is registered as an action rather
		// than a window listener. It also earns a row in the keyboard shortcuts dialog that way.
		actions['inline-prompt'] = {
			id: 'inline-prompt',
			kbd: '$i',
			label: 'Ask here',
			readonlyOk: false,
			onSelect: () => openInlinePrompt(editor),
		}
		return actions
	},
	tools(editor, tools) {
		tools.math = {
			id: 'math',
			icon: 'code',
			kbd: 'm',
			label: 'Equation',
			onSelect: () => editor.setCurrentTool('math'),
		}
		return tools
	},
}
