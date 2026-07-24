import { appRoutes } from '@agentboard/shared'
import {
	IconCheck,
	IconChevronRight,
	IconCopy,
	IconLayoutSidebarRightCollapse,
	IconLayoutSidebarRightExpand,
	IconLock,
	IconPlayerPause,
	IconPlayerPlay,
	IconX,
} from '@tabler/icons-react'
import { type ReactNode, useEffect, useState } from 'react'
import { ThemeToggle } from '../../theme/ThemeToggle'
import { LockInSetup } from '../../lock-in/LockInSetup'
import { LockInCelebration } from '../../lock-in/LockInCelebration'
import { useLockIn } from '../../lock-in/LockInProvider'
import {
	formatLockInTime,
	getLockInElapsedMS,
	getLockInRemainingMS,
} from '../../lock-in/lib/lockInSession'

const STUDY_PANEL_STORAGE_KEY = 'agentboard.study-panel'

interface BoardShellProps {
	boardID: string
	children: ReactNode
	studyPanel: ReactNode
	title: string
}

export function BoardShell({ boardID, children, studyPanel, title }: BoardShellProps) {
	const [didCopy, setDidCopy] = useState(false)
	const [isStudyOpen, setIsStudyOpen] = useState(readStudyPanelPreference)
	const [isOnline, setIsOnline] = useState(navigator.onLine)
	const {
		endSession,
		now,
		openSetup,
		pauseSession,
		resumeSession,
		session,
	} = useLockIn()

	useEffect(() => {
		if (!didCopy) return

		const timeout = window.setTimeout(() => setDidCopy(false), 3000)
		return () => window.clearTimeout(timeout)
	}, [didCopy])

	useEffect(() => {
		const update = () => setIsOnline(navigator.onLine)
		window.addEventListener('online', update)
		window.addEventListener('offline', update)
		return () => {
			window.removeEventListener('online', update)
			window.removeEventListener('offline', update)
		}
	}, [])

	useEffect(() => {
		if (session) setStudyPanelOpen(true)
	}, [session?.id])

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

	return (
		<div className="BoardShell" data-lock-in={Boolean(session)} data-study-open={isStudyOpen}>
			<div className="BoardShell-workspace">
				<main className="BoardShell-content">{children}</main>
				<header className="BoardShell-header">
					<div className="BoardShell-headerGroup">
						<nav aria-label="Breadcrumb" className="BoardShell-crumbs">
							<a href={appRoutes.home}>Boards</a>
							<IconChevronRight aria-hidden="true" size={13} stroke={1.8} />
							<span className="BoardShell-title" data-board-id={boardID} title={title}>{title}</span>
						</nav>
						<span className={`BoardShell-status${isOnline ? '' : ' BoardShell-status--offline'}`} role="status">
							{isOnline ? 'Live' : 'Offline'}
						</span>
					</div>
					<div className="BoardShell-headerGroup BoardShell-headerGroup--actions">
						{session ? (
							<div className="LockInTimer" role="timer">
								<IconLock aria-hidden="true" size={15} stroke={1.9} />
								<strong>{formatLockInTime(getLockInRemainingMS(session, now))}</strong>
								<span className="LockInTimer-progress" aria-hidden="true">
									<i style={{
										transform: `scaleX(${Math.min(1, getLockInElapsedMS(session, now) / (session.durationMinutes * 60_000))})`,
									}} />
								</span>
								<button
									aria-label={session.runningSince === null ? 'Resume Lock In session' : 'Pause Lock In session'}
									onClick={session.runningSince === null ? resumeSession : pauseSession}
									title={session.runningSince === null ? 'Resume Lock In session' : 'Pause Lock In session'}
									type="button"
								>
									{session.runningSince === null
										? <IconPlayerPlay aria-hidden="true" size={15} />
										: <IconPlayerPause aria-hidden="true" size={15} />}
								</button>
								<button
									aria-label="End Lock In session"
									className="LockInTimer-end"
									onClick={endSession}
									title="End Lock In session"
									type="button"
								>
									<IconX aria-hidden="true" size={15} />
								</button>
							</div>
						) : null}
						{!session ? <button
							className="BoardShell-lockIn"
							onClick={() => {
								setStudyPanelOpen(false)
								openSetup()
							}}
							title="Start Lock In Mode"
							type="button"
						>
							<IconLock aria-hidden="true" size={15} stroke={1.8} />
							<span>Lock In</span>
						</button> : null}
						<button
							aria-label={didCopy ? 'Board link copied' : 'Copy board link'}
							aria-live="polite"
							className="BoardShell-copy"
							onClick={() => void copyBoardLink()}
							title={didCopy ? 'Board link copied' : 'Copy board link'}
							type="button"
						>
							{didCopy ? <IconCheck aria-hidden="true" size={15} key="check" /> : <IconCopy aria-hidden="true" size={15} key="copy" />}
							<span>{didCopy ? 'Copied' : 'Copy link'}</span>
						</button>
						<ThemeToggle />
						<button
							aria-controls="study-panel"
							aria-expanded={isStudyOpen}
							aria-label={isStudyOpen ? 'Close study panel' : 'Open study panel'}
							className="BoardShell-studyToggle"
							onClick={() => setStudyPanelOpen(!isStudyOpen)}
							title={isStudyOpen ? 'Close study panel' : 'Open study panel'}
							type="button"
						>
							{isStudyOpen
								? <IconLayoutSidebarRightCollapse aria-hidden="true" size={15} stroke={1.8} key="collapse" />
								: <IconLayoutSidebarRightExpand aria-hidden="true" size={15} stroke={1.8} key="expand" />}
							<span>Study</span>
						</button>
					</div>
				</header>
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
