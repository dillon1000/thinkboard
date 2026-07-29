import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react'

interface ZenModeContextValue {
	/** When on, every control — ours and tldraw's — is hidden; the radial menu is the only way in. */
	enabled: boolean
	setEnabled: (on: boolean) => void
	toggle: () => void
	/** The Spotify petal reveals a floating player that stays put while the radial opens and closes. */
	spotifyOpen: boolean
	setSpotifyOpen: (open: boolean) => void
	/** Opens the study pane, wherever it lives. Registered by the shell that owns that state. */
	openChat: () => void
	registerOpenChat: (open: (() => void) | null) => void
	/** Triggers the PDF file picker, whose input lives in the import control. */
	importPDF: () => void
	registerImportPDF: (importPDF: (() => void) | null) => void
}

const ZenModeContext = createContext<ZenModeContextValue | null>(null)

/**
 * Zen Mode is board-wide state read from two different React trees — the board shell around the
 * canvas and tldraw's own components inside it — so it lives in a context that wraps both. The
 * chat and PDF actions belong to components the radial menu can't reach directly, so those two
 * register a callback here rather than being lifted wholesale.
 */
export function ZenModeProvider({ children }: { children: ReactNode }) {
	const [enabled, setEnabled] = useState(false)
	const [spotifyOpen, setSpotifyOpen] = useState(false)
	const openChatRef = useRef<(() => void) | null>(null)
	const importPDFRef = useRef<(() => void) | null>(null)

	/* Leaving Zen puts the floating player away so it doesn't linger over the restored chrome. */
	useEffect(() => {
		if (!enabled) setSpotifyOpen(false)
	}, [enabled])

	const value = useMemo<ZenModeContextValue>(() => ({
		enabled,
		setEnabled,
		toggle: () => setEnabled((current) => !current),
		spotifyOpen,
		setSpotifyOpen,
		openChat: () => openChatRef.current?.(),
		registerOpenChat: (open) => { openChatRef.current = open },
		importPDF: () => importPDFRef.current?.(),
		registerImportPDF: (importPDF) => { importPDFRef.current = importPDF },
	}), [enabled, spotifyOpen])

	return <ZenModeContext.Provider value={value}>{children}</ZenModeContext.Provider>
}

export function useZenMode() {
	const context = useContext(ZenModeContext)
	if (!context) throw new Error('useZenMode must be used within a ZenModeProvider')
	return context
}
