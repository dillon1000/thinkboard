import { atom, useValue, type Editor, type VecModel } from 'tldraw'

/** Space left under a selection so the composer, and then the artifact, clear the student's work. */
const SELECTION_GAP = 24

export interface InlinePromptSession {
	/** Page point where the composer sits and where the resulting artifact is placed. */
	anchor: VecModel
	/** Regenerated on every invocation so each request starts from an empty composer. */
	sessionID: string
}

const inlinePromptSession = atom<InlinePromptSession | null>('inlinePromptSession', null)

/**
 * Opens the composer under the current selection, or at the pointer when nothing is selected, so
 * the request and its answer land where the student is already looking.
 */
export function openInlinePrompt(editor: {
	getSelectionPageBounds: Editor['getSelectionPageBounds']
	inputs: { currentPagePoint: VecModel }
}) {
	const selectionBounds = editor.getSelectionPageBounds()
	const anchor = selectionBounds
		? { x: selectionBounds.x, y: selectionBounds.maxY + SELECTION_GAP }
		: { x: editor.inputs.currentPagePoint.x, y: editor.inputs.currentPagePoint.y }
	inlinePromptSession.set({ anchor, sessionID: crypto.randomUUID() })
}

export function closeInlinePrompt() {
	inlinePromptSession.set(null)
}

export function getInlinePromptSession() {
	return inlinePromptSession.get()
}

export function useInlinePromptSession() {
	return useValue('inlinePromptSession', () => inlinePromptSession.get(), [])
}
