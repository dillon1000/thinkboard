import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import type { Editor } from 'tldraw'
import {
	createProjectorCode,
	setProjectorPresenceMetadata,
} from './projectorMode'

const PROJECTOR_INTRO_MS = 4_000

interface ProjectorModeContextValue {
	closePairing: () => void
	controllerCode: string | null
	disconnectController: () => void
	enabled: boolean
	enter: (editor: Editor) => void
	exit: () => void
	introVisible: boolean
	openPairing: () => void
	pairingOpen: boolean
	projectorCode: string | null
	setController: (editor: Editor, code: string) => void
}

const ProjectorModeContext = createContext<ProjectorModeContextValue | null>(null)

/**
 * Owns projector UI state and mirrors the active device role into tldraw presence. The browser
 * Fullscreen API is best-effort because browser or device policy can deny the request.
 */
export function ProjectorModeProvider({ children }: { children: ReactNode }) {
	const [controllerCode, setControllerCode] = useState<string | null>(null)
	const [enabled, setEnabled] = useState(false)
	const [introVisible, setIntroVisible] = useState(false)
	const [pairingOpen, setPairingOpen] = useState(false)
	const [projectorCode, setProjectorCode] = useState<string | null>(null)
	const editorRef = useRef<Editor | null>(null)
	const requestedFullscreenRef = useRef(false)

	const clearPresence = useCallback(() => {
		if (editorRef.current) setProjectorPresenceMetadata(editorRef.current, null)
	}, [])

	const exit = useCallback(() => {
		clearPresence()
		setEnabled(false)
		setIntroVisible(false)
		setProjectorCode(null)
		requestedFullscreenRef.current = false
		if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
	}, [clearPresence])

	const enter = useCallback((editor: Editor) => {
		editorRef.current = editor
		const code = createProjectorCode()
		setControllerCode(null)
		setEnabled(true)
		setIntroVisible(true)
		setPairingOpen(false)
		setProjectorCode(code)
		setProjectorPresenceMetadata(editor, { code, mode: 'projector' })

		if (document.documentElement.requestFullscreen) {
			requestedFullscreenRef.current = true
			void document.documentElement.requestFullscreen().catch(() => {
				requestedFullscreenRef.current = false
			})
		}
	}, [])

	const setController = useCallback((editor: Editor, code: string) => {
		editorRef.current = editor
		setControllerCode(code)
		setPairingOpen(false)
		setProjectorPresenceMetadata(editor, { code, mode: 'controller' })
	}, [])

	const disconnectController = useCallback(() => {
		clearPresence()
		setControllerCode(null)
	}, [clearPresence])

	useEffect(() => {
		if (!introVisible) return
		const timeout = window.setTimeout(() => setIntroVisible(false), PROJECTOR_INTRO_MS)
		return () => window.clearTimeout(timeout)
	}, [introVisible])

	useEffect(() => {
		const handleFullscreenChange = () => {
			if (enabled && requestedFullscreenRef.current && !document.fullscreenElement) exit()
		}
		document.addEventListener('fullscreenchange', handleFullscreenChange)
		return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
	}, [enabled, exit])

	useEffect(() => () => clearPresence(), [clearPresence])

	const value = useMemo<ProjectorModeContextValue>(() => ({
		closePairing: () => setPairingOpen(false),
		controllerCode,
		disconnectController,
		enabled,
		enter,
		exit,
		introVisible,
		openPairing: () => setPairingOpen(true),
		pairingOpen,
		projectorCode,
		setController,
	}), [
		controllerCode,
		disconnectController,
		enabled,
		enter,
		exit,
		introVisible,
		pairingOpen,
		projectorCode,
		setController,
	])

	return <ProjectorModeContext.Provider value={value}>{children}</ProjectorModeContext.Provider>
}

export function useProjectorMode() {
	const context = useContext(ProjectorModeContext)
	if (!context) throw new Error('useProjectorMode must be used within a ProjectorModeProvider')
	return context
}
