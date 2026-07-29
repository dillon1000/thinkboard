import { appRoutes } from '@agentboard/shared'
import {
	IconBrain,
	IconLayoutBoard,
	IconLayoutSidebarLeftCollapse,
	IconLayoutSidebarLeftExpand,
	IconLogout2,
	IconSparkles,
	IconSettings,
	IconSun,
} from '@tabler/icons-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { authClient } from '../../../lib/authClient'
import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'
import { ThemeToggle } from '../../theme/ThemeToggle'

const SIDEBAR_STORAGE_KEY = 'agentboard.dashboard-sidebar'

interface WorkspaceShellProps {
	activePage: 'boards' | 'memory' | 'settings' | 'today'
	children: ReactNode
	skipTargetID: string
	title: string
}

export function WorkspaceShell({
	activePage,
	children,
	skipTargetID,
	title,
}: WorkspaceShellProps) {
	const [isSidebarOpen, setIsSidebarOpen] = useState(readSidebarPreference)
	const session = authClient.useSession()
	const navigate = useNavigate()

	useEffect(() => {
		const compactLayout = window.matchMedia('(max-width: 840px)')
		const closeSidebar = (event: MediaQueryListEvent) => {
			if (event.matches) setIsSidebarOpen(false)
		}

		compactLayout.addEventListener('change', closeSidebar)
		return () => compactLayout.removeEventListener('change', closeSidebar)
	}, [])

	function setSidebarOpen(isOpen: boolean) {
		setIsSidebarOpen(isOpen)
		setLocalStorageItem(SIDEBAR_STORAGE_KEY, isOpen ? 'open' : 'closed')
	}

	async function handleSignOut() {
		await authClient.signOut()
		navigate(appRoutes.login, { replace: true })
	}

	return (
		<main className="Dashboard" data-sidebar={isSidebarOpen ? 'open' : 'closed'}>
			<a className="SkipLink" href={`#${skipTargetID}`}>Skip to {title.toLowerCase()}</a>
			<aside className="Dashboard-sidebar" inert={!isSidebarOpen}>
				<div className="Dashboard-sidebarTop">
					<Link className="Wordmark" to={appRoutes.home}>
						<span><IconSparkles aria-hidden="true" size={15} stroke={1.8} /></span>
						Agentboard
					</Link>
					<button aria-label="Collapse sidebar" className="IconButton" onClick={() => setSidebarOpen(false)} title="Collapse sidebar" type="button">
						<IconLayoutSidebarLeftCollapse aria-hidden="true" size={17} stroke={1.7} />
					</button>
				</div>
				<nav className="Dashboard-nav" aria-label="Workspace">
					<Link aria-current={activePage === 'boards' ? 'page' : undefined} to={appRoutes.home}>
						<IconLayoutBoard aria-hidden="true" size={16} stroke={1.7} /> Boards
					</Link>
					<Link aria-current={activePage === 'today' ? 'page' : undefined} to={appRoutes.today}>
						<IconSun aria-hidden="true" size={16} stroke={1.7} /> Today
					</Link>
					<Link aria-current={activePage === 'memory' ? 'page' : undefined} to={appRoutes.memory}>
						<IconBrain aria-hidden="true" size={16} stroke={1.7} /> Memory
					</Link>
					<Link aria-current={activePage === 'settings' ? 'page' : undefined} to={appRoutes.settings}>
						<IconSettings aria-hidden="true" size={16} stroke={1.7} /> Settings
					</Link>
				</nav>
				<div className="Dashboard-user">
					<div className="Dashboard-avatar" aria-hidden="true">{getInitial(session.data?.user.name)}</div>
					<span>{session.data?.user.name}</span>
					<ThemeToggle />
					<button aria-label="Sign out" className="IconButton" onClick={() => void handleSignOut()} title="Sign out" type="button">
						<IconLogout2 aria-hidden="true" size={16} stroke={1.8} />
					</button>
				</div>
			</aside>
			<button
				aria-label="Close navigation"
				className="Dashboard-sidebarScrim"
				onClick={() => setSidebarOpen(false)}
				tabIndex={isSidebarOpen ? 0 : -1}
				type="button"
			/>

			<section className="Dashboard-main">
				<header className="Dashboard-topbar">
					{!isSidebarOpen ? (
						<button aria-label="Open sidebar" className="IconButton" onClick={() => setSidebarOpen(true)} title="Open sidebar" type="button">
							<IconLayoutSidebarLeftExpand aria-hidden="true" size={17} stroke={1.7} />
						</button>
					) : null}
					<span>{title}</span>
				</header>
				{children}
			</section>
		</main>
	)
}

function readSidebarPreference() {
	if (window.matchMedia('(max-width: 840px)').matches) return false
	return getLocalStorageItem(SIDEBAR_STORAGE_KEY) !== 'closed'
}

function getInitial(name: string | null | undefined) {
	return name?.trim().charAt(0).toUpperCase() || 'A'
}
