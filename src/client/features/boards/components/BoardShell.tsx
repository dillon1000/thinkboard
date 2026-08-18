import { IconLayoutSidebarRightCollapse } from '@tabler/icons-react'
import type { BoardRole } from '@agentboard/shared'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useOnlineStatus } from '../../../lib/browser/useOnlineStatus'
import { BoardChromeProvider } from '../lib/BoardChromeProvider'
import { useZenMode } from '../lib/ZenModeProvider'
import { LockInSetup } from '../../lock-in/LockInSetup'
import { LockInCelebration } from '../../lock-in/LockInCelebration'
import { useLockIn } from '../../lock-in/LockInProvider'
import { useProjectorMode } from '../lib/ProjectorModeProvider'
import { SpaceShareDialog } from '../../workspace/components/SpaceShareDialog'

const STUDY_PANEL_STORAGE_KEY = 'agentboard.study-panel'

interface BoardShellProps {
	boardID: string
	children: ReactNode
	role: BoardRole
	studyPanel: ReactNode
	title: string
}

export function BoardShell({ boardID, children, role, studyPanel, title }: BoardShellProps) {
	const [didCopy, setDidCopy] = useState(false)
	const [isShareOpen, setIsShareOpen] = useState(false)
	const [isStudyOpen, setIsStudyOpen] = useState(readStudyPanelPreference)
	const isOnline = useOnlineStatus()
	const zen = useZenMode()
	const projector = useProjectorMode()
	const { session } = useLockIn()

	useEffect(() => {
		if (!didCopy) return

		const timeout = window.setTimeout(() => setDidCopy(false), 3000)
		return () => window.clearTimeout(timeout)
	}, [didCopy])

	useEffect(() => {
		if (session) setStudyPanelOpen(true)
	}, [session?.id])

	/* The radial menu's Chat petal opens the study pane through here — it can't reach this state. */
	useEffect(() => {
		zen.registerOpenChat(() => setStudyPanelOpen(true))
		return () => zen.registerOpenChat(null)
	}, [zen])

	/* Entering Zen clears the canvas; the chat petal brings the study pane back when it's wanted. */
	useEffect(() => {
		if (zen.enabled) setStudyPanelOpen(false)
	}, [zen.enabled])

	/* Projector mode reserves the full screen for the followed canvas and its pairing status. */
	useEffect(() => {
		if (projector.enabled) setStudyPanelOpen(false)
	}, [projector.enabled])

	async function copyBoardLink() {
		await navigator.clipboard.writeText(window.location.href)
		setDidCopy(true)
	}

	function setStudyPanelOpen(isOpen: boolean) {
		setIsStudyOpen(isOpen)
		try {
			window.sessionStorage.setItem(STUDY_PANEL_STORAGE_KEY, isOpen ? 'open' : 'closed')
		} catch {
			// The panel remains usable when browser storage is unavailable.
		}
	}

	const chrome = useMemo(() => ({
		boardID,
		copyBoardLink: () => void copyBoardLink(),
		didCopyBoardLink: didCopy,
		isOnline,
		isStudyOpen,
		openShare: () => setIsShareOpen(true),
		role,
		setStudyOpen: setStudyPanelOpen,
		title,
	}), [boardID, didCopy, isOnline, isStudyOpen, role, title])

	return (
		<div
			className="BoardShell"
			data-lock-in={Boolean(session)}
			data-projector={projector.enabled}
			data-study-open={isStudyOpen}
			data-zen={zen.enabled}
		>
			<div className="BoardShell-workspace">
				<main className="BoardShell-content">
					<BoardChromeProvider value={chrome}>{children}</BoardChromeProvider>
				</main>
				<button
					aria-label="Close study panel"
					className="BoardShell-studyScrim"
					data-open={isStudyOpen}
					onClick={() => setStudyPanelOpen(false)}
					tabIndex={isStudyOpen ? 0 : -1}
					type="button"
				/>
				<aside className="BoardShell-study" data-open={isStudyOpen} id="study-panel" inert={!isStudyOpen}>
					<div className="BoardShell-studyInner">
						<button aria-label="Collapse study panel" className="BoardShell-studyClose" onClick={() => setStudyPanelOpen(false)} title="Collapse study panel" type="button">
							<IconLayoutSidebarRightCollapse aria-hidden="true" size={16} stroke={1.8} />
						</button>
						{studyPanel}
					</div>
				</aside>
				<LockInSetup />
				<LockInCelebration />
			</div>
			{isShareOpen ? (
				<SpaceShareDialog boardID={boardID} onClose={() => setIsShareOpen(false)} />
			) : null}
		</div>
	)
}

function readStudyPanelPreference() {
	try {
		const preference = window.sessionStorage.getItem(STUDY_PANEL_STORAGE_KEY)
		if (preference) return preference === 'open'
		return window.matchMedia('(min-width: 1025px)').matches
	} catch {
		return window.matchMedia('(min-width: 1025px)').matches
	}
}
