import type { BoardRole } from '@agentboard/shared'
import { createContext, useContext, type ReactNode } from 'react'

interface BoardChromeContextValue {
	boardID: string
	role: BoardRole
	/** Board name, shown in the ribbon's breadcrumb. */
	title: string
	/** Sync state of the board socket, surfaced as the Live/Offline pill. */
	isOnline: boolean
	isStudyOpen: boolean
	setStudyOpen: (open: boolean) => void
	copyBoardLink: () => void
	openShare: () => void
	/** True for a few seconds after a copy, so the control can confirm itself. */
	didCopyBoardLink: boolean
}

const BoardChromeContext = createContext<BoardChromeContextValue | null>(null)

/**
 * The ribbon carries both halves of the board's chrome: tldraw's controls, which need the editor
 * context, and the shell's own — title, share, study pane — which live outside the canvas. Since
 * the ribbon has to render inside tldraw to reach the editor, the shell hands its half down here.
 */
export function BoardChromeProvider({
	children,
	value,
}: {
	children: ReactNode
	value: BoardChromeContextValue
}) {
	return <BoardChromeContext.Provider value={value}>{children}</BoardChromeContext.Provider>
}

export function useBoardChrome() {
	const context = useContext(BoardChromeContext)
	if (!context) throw new Error('useBoardChrome must be used within a BoardChromeProvider')
	return context
}
