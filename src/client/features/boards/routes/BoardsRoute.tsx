import type { Board, Course, DueFlashcard } from '@agentboard/shared'
import { apiRoutes, appRoutes } from '@agentboard/shared'
import { usePostHog } from '@posthog/react'
import {
	IconArchive,
	IconBrandCraft,
	IconBrain,
	IconCards,
	IconChevronDown,
	IconDots,
	IconEyeOff,
	IconLayoutBoard,
	IconLayoutSidebarLeftCollapse,
	IconLayoutSidebarLeftExpand,
	IconLogout2,
	IconPencil,
	IconPlus,
	IconRestore,
	IconSettings,
	IconSun,
} from '@tabler/icons-react'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Streamdown } from 'streamdown'
import { ThinkspaceWordmark } from '../../../components/ThinkspaceWordmark'
import { apiRequest } from '../../../lib/api'
import { authClient } from '../../../lib/authClient'
import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'
import {
	readDueReviewVisibility,
	writeDueReviewVisibility,
} from '../lib/dueReviewPreferences'
import { studyMarkdownPlugins } from '../../study/lib/studyMath'
import { ThemeToggle } from '../../theme/ThemeToggle'
import {
	CraftWhiteboardImportDialog,
} from '../../craft/components/CraftWhiteboardImportDialog'
import { addCraftWhiteboardImportParameters } from '../../craft/whiteboards/craftWhiteboardNavigation'
import { FlashcardAnswerPanel } from '../../study/components/FlashcardAnswerPanel'
import { CoursePlanner } from '../../workspace/components/CoursePlanner'

const SIDEBAR_STORAGE_KEY = 'agentboard.dashboard-sidebar'

export function Component() {
	const [boards, setBoards] = useState<Board[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [archivedBoards, setArchivedBoards] = useState<Board[]>([])
	const [dueReviews, setDueReviews] = useState<DueFlashcard[]>([])
	const [title, setTitle] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isCreating, setIsCreating] = useState(false)
	const [isComposerOpen, setIsComposerOpen] = useState(false)
	const [isListOpen, setIsListOpen] = useState(true)
	const [isArchiveOpen, setIsArchiveOpen] = useState(false)
	const [isSidebarOpen, setIsSidebarOpen] = useState(readSidebarPreference)
	const [showDueReviews, setShowDueReviews] = useState(readDueReviewVisibility)
	const [isDueReviewMenuOpen, setIsDueReviewMenuOpen] = useState(false)
	const [isCraftWhiteboardImportOpen, setIsCraftWhiteboardImportOpen] = useState(false)
	const composerInputRef = useRef<HTMLInputElement>(null)
	const dueReviewMenuTriggerRef = useRef<HTMLButtonElement>(null)
	const dueReviewHideButtonRef = useRef<HTMLButtonElement>(null)
	const session = authClient.useSession()
	const navigate = useNavigate()
	const posthog = usePostHog()

	useEffect(() => {
		void loadBoards()
		if (showDueReviews) void loadDueReviews()
	}, [])

	useEffect(() => {
		if (isComposerOpen) composerInputRef.current?.focus()
	}, [isComposerOpen])

	useEffect(() => {
		if (isDueReviewMenuOpen) dueReviewHideButtonRef.current?.focus()
	}, [isDueReviewMenuOpen])

	useEffect(() => {
		const compactLayout = window.matchMedia('(max-width: 840px)')
		const closeSidebar = (event: MediaQueryListEvent) => {
			if (event.matches) setIsSidebarOpen(false)
		}

		compactLayout.addEventListener('change', closeSidebar)
		return () => compactLayout.removeEventListener('change', closeSidebar)
	}, [])

	async function loadBoards() {
		setIsLoading(true)
		try {
			const [activeResponse, archivedResponse, courseResponse] = await Promise.all([
				apiRequest<{ boards: Board[] }>(apiRoutes.boards),
				apiRequest<{ boards: Board[] }>(apiRoutes.archivedBoards),
				apiRequest<{ courses: Course[] }>(apiRoutes.courses),
			])
			setBoards(activeResponse.boards)
			setArchivedBoards(archivedResponse.boards)
			setCourses(courseResponse.courses)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load spaces')
		} finally {
			setIsLoading(false)
		}
	}

	async function loadDueReviews() {
		try {
			const response = await apiRequest<{ reviews: DueFlashcard[] }>(apiRoutes.studyReviews)
			setDueReviews(response.reviews)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load today’s reviews')
		}
	}

	function setSidebarOpen(isOpen: boolean) {
		setIsSidebarOpen(isOpen)
		setLocalStorageItem(SIDEBAR_STORAGE_KEY, isOpen ? 'open' : 'closed')
	}

	function openComposer() {
		setIsListOpen(true)
		setIsComposerOpen(true)
	}

	function hideDueReviews() {
		setIsDueReviewMenuOpen(false)
		setShowDueReviews(false)
		writeDueReviewVisibility(false)
	}

	async function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!title.trim()) return
		setIsCreating(true)
		setError(null)
		try {
			const response = await apiRequest<{ board: Board }>(apiRoutes.boards, {
				method: 'POST',
				body: JSON.stringify({ title }),
			})
			posthog?.capture('board_created')
			navigate(appRoutes.board(response.board.id))
		} catch (createError) {
			setError(createError instanceof Error ? createError.message : 'Unable to create space')
			setIsCreating(false)
		}
	}

	async function handleSignOut() {
		posthog?.capture('user_signed_out')
		posthog?.reset()
		await authClient.signOut()
		navigate(appRoutes.login, { replace: true })
	}

	async function handleRename(board: Board) {
		const title = window.prompt('Rename space', board.title)?.trim()
		if (!title || title === board.title) return
		try {
			await apiRequest<{ ok: true }>(apiRoutes.board(board.id), {
				method: 'PATCH',
				body: JSON.stringify({ title }),
			})
			setBoards((current) => current.map((item) => item.id === board.id ? { ...item, title } : item))
		} catch (renameError) {
			setError(renameError instanceof Error ? renameError.message : 'Unable to rename space')
		}
	}

	async function handleArchive(board: Board) {
		if (!window.confirm(`Archive “${board.title}”? The space will leave your recent list, but its data is not permanently deleted.`)) return
		try {
			await fetch(apiRoutes.board(board.id), { method: 'DELETE' }).then((response) => {
				if (!response.ok) throw new Error('Unable to archive space')
			})
				posthog?.capture('board_archived')
				setBoards((current) => current.filter((item) => item.id !== board.id))
				setArchivedBoards((current) => [board, ...current])
		} catch (archiveError) {
			setError(archiveError instanceof Error ? archiveError.message : 'Unable to archive space')
		}
	}

	async function handleRestore(board: Board) {
		setError(null)
		try {
			const response = await apiRequest<{ board: Board }>(apiRoutes.boardRestore(board.id), {
				method: 'POST',
			})
			posthog?.capture('board_restored')
			setArchivedBoards((current) => current.filter(({ id }) => id !== board.id))
			setBoards((current) => [response.board, ...current])
		} catch (restoreError) {
			setError(restoreError instanceof Error ? restoreError.message : 'Unable to restore space')
		}
	}

	return (
		<main className="Dashboard" data-sidebar={isSidebarOpen ? 'open' : 'closed'}>
			<a className="SkipLink" href="#board-library">Skip to spaces</a>
			<aside className="Dashboard-sidebar" inert={!isSidebarOpen}>
				<div className="Dashboard-sidebarTop">
					<a className="Wordmark" href={appRoutes.home}>
						<ThinkspaceWordmark />
					</a>
					<button aria-label="Collapse sidebar" className="IconButton" onClick={() => setSidebarOpen(false)} title="Collapse sidebar" type="button">
						<IconLayoutSidebarLeftCollapse aria-hidden="true" size={17} stroke={1.7} />
					</button>
				</div>
				<nav className="Dashboard-nav" aria-label="Workspace">
					<a aria-current="page" href={appRoutes.home}><IconLayoutBoard aria-hidden="true" size={16} stroke={1.7} /> Spaces</a>
					<Link to={appRoutes.today}><IconSun aria-hidden="true" size={16} stroke={1.7} /> Today</Link>
					<Link to={appRoutes.memory}><IconBrain aria-hidden="true" size={16} stroke={1.7} /> Memory</Link>
					<Link to={appRoutes.settings}><IconSettings aria-hidden="true" size={16} stroke={1.7} /> Settings</Link>
				</nav>
				<div className="CraftWhiteboard-sidebarFooter">
					<button
						className="CraftWhiteboard-homeTrigger"
						onClick={() => setIsCraftWhiteboardImportOpen(true)}
						type="button"
					>
						<IconBrandCraft aria-hidden="true" size={16} stroke={1.7} />
						Import Craft whiteboard
					</button>
					<div className="Dashboard-user">
						<div className="Dashboard-avatar" aria-hidden="true">{getInitial(session.data?.user.name)}</div>
						<span>{session.data?.user.name}</span>
						<ThemeToggle />
						<button aria-label="Sign out" className="IconButton" onClick={() => void handleSignOut()} title="Sign out" type="button">
							<IconLogout2 aria-hidden="true" size={16} stroke={1.8} />
						</button>
					</div>
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
					<span>Spaces</span>
				</header>

				<div className="Dashboard-content">
					<h1 className="Dashboard-greeting">{getGreeting()}{getFirstName(session.data?.user.name)}</h1>

					{error ? <p className="FormError" role="alert">{error}</p> : null}

					<CoursePlanner
						boards={boards}
						courses={courses}
						onBoardsChange={setBoards}
						onCoursesChange={setCourses}
						onError={setError}
					/>

					{showDueReviews ? <section aria-labelledby="due-reviews-heading" className="DueReviews">
						<div className="SectionHeading">
							<span className="SectionHeading-toggle" id="due-reviews-heading"><IconCards aria-hidden="true" size={14} /> Due today</span>
							<span className="SectionHeading-count">{dueReviews.length || ''}</span>
							<div
								className="SectionHeading-menu"
								onBlur={(event) => {
									if (!event.currentTarget.contains(event.relatedTarget)) setIsDueReviewMenuOpen(false)
								}}
								onKeyDown={(event) => {
									if (event.key !== 'Escape') return
									event.preventDefault()
									setIsDueReviewMenuOpen(false)
									dueReviewMenuTriggerRef.current?.focus()
								}}
							>
								<button
									aria-expanded={isDueReviewMenuOpen}
									aria-haspopup="menu"
									aria-label="More Due Today actions"
									className="SectionHeading-menuTrigger"
									onClick={() => setIsDueReviewMenuOpen((isOpen) => !isOpen)}
									ref={dueReviewMenuTriggerRef}
									title="More actions"
									type="button"
								>
									<IconDots aria-hidden="true" size={16} stroke={1.8} />
								</button>
								{isDueReviewMenuOpen ? (
									<div aria-label="Due Today actions" className="SectionHeading-menuContent" role="menu">
										<button onClick={hideDueReviews} ref={dueReviewHideButtonRef} role="menuitem" type="button">
											<IconEyeOff aria-hidden="true" size={15} stroke={1.8} />
											Hide Due Today
										</button>
									</div>
								) : null}
							</div>
						</div>
						{dueReviews.length ? <div className="DueReviewList scroll-fade-x">{dueReviews.map((review) => (
							<article className="DueReviewCard" key={review.reviewID}>
								<div><Link to={appRoutes.board(review.boardID)}>{review.boardTitle}</Link><small>{review.reviewCount ? `${review.reviewCount} reviews` : 'New card'}</small></div>
								<FlashcardMarkdown className="DueReviewCard-front">{review.front}</FlashcardMarkdown>
								<FlashcardAnswerPanel
									onCompleted={() => setDueReviews((current) => current.filter(({ reviewID }) => reviewID !== review.reviewID))}
									source={{ kind: 'review', reviewID: review.reviewID }}
								/>
							</article>
						))}</div> : <p className="DueReviews-empty">You’re caught up. New flashcards appear here when they’re ready to review.</p>}
					</section> : null}

						<section className="BoardLibrary" id="board-library" aria-labelledby="recent-boards-heading">
						<div className="SectionHeading">
							<button aria-expanded={isListOpen} className="SectionHeading-toggle" onClick={() => setIsListOpen((open) => !open)} type="button">
								<IconChevronDown aria-hidden="true" size={14} stroke={2} />
								<span id="recent-boards-heading">Recent</span>
							</button>
							<span className="SectionHeading-count">{boards.length || ''}</span>
							<button className="SectionHeading-new" onClick={openComposer} type="button">
								<IconPlus aria-hidden="true" size={14} stroke={2} /> New space
							</button>
						</div>

						{isComposerOpen ? (
							<form className="NewBoard" onSubmit={(event) => void handleCreate(event)}>
								<input
									aria-label="Space title"
									autoComplete="off"
									maxLength={120}
									name="board-title"
									onChange={(event) => setTitle(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === 'Escape') {
											setIsComposerOpen(false)
											setTitle('')
										}
									}}
									placeholder="Cell biology — midterm…"
									ref={composerInputRef}
									required
									value={title}
								/>
								<button className="Button Button--primary" disabled={isCreating || !title.trim()} type="submit">
									{isCreating ? 'Creating…' : 'Create'}
								</button>
							</form>
						) : null}

						{isListOpen ? (
							<>
								{isLoading ? <p className="EmptyState" role="status">Fetching your spaces…</p> : null}
								{!isLoading && boards.length === 0 ? (
									<div className="EmptyState"><span><IconLayoutBoard aria-hidden="true" size={18} stroke={1.6} /></span><strong>No spaces yet</strong><p>Create your first space to get started.</p></div>
								) : null}
								{boards.length ? <div className="BoardList">
									{boards.map((board, index) => (
										<article className="BoardRow" key={board.id} style={{ '--row-index': Math.min(index, 12) } as CSSProperties}>
											<Link className="BoardRow-main" to={appRoutes.board(board.id)}>
												<span className="BoardRow-icon"><IconLayoutBoard aria-hidden="true" size={17} stroke={1.6} /></span>
												<span className="BoardRow-copy"><strong>{board.title}</strong><BoardMeta board={board} courses={courses} /></span>
											</Link>
											<div className="BoardRow-actions">
												<button aria-label={`Rename ${board.title}`} onClick={() => void handleRename(board)} title="Rename" type="button"><IconPencil aria-hidden="true" size={15} stroke={1.7} /></button>
												{board.role === 'owner' ? <button aria-label={`Archive ${board.title}`} onClick={() => void handleArchive(board)} title="Archive" type="button"><IconArchive aria-hidden="true" size={15} stroke={1.7} /></button> : null}
											</div>
										</article>
									))}
								</div> : null}
							</>
						) : null}
						</section>
						{archivedBoards.length ? (
							<section className="BoardLibrary" aria-labelledby="archived-boards-heading">
								<div className="SectionHeading">
									<button
										aria-expanded={isArchiveOpen}
										className="SectionHeading-toggle"
										onClick={() => setIsArchiveOpen((open) => !open)}
										type="button"
									>
										<IconChevronDown aria-hidden="true" size={14} stroke={2} />
										<span id="archived-boards-heading">Archived</span>
									</button>
									<span className="SectionHeading-count">{archivedBoards.length}</span>
								</div>
								{isArchiveOpen ? (
									<div className="BoardList">
										{archivedBoards.map((board, index) => (
											<article className="BoardRow BoardRow--archived" key={board.id} style={{ '--row-index': Math.min(index, 12) } as CSSProperties}>
												<div className="BoardRow-main">
													<span className="BoardRow-icon"><IconArchive aria-hidden="true" size={17} stroke={1.6} /></span>
													<span className="BoardRow-copy"><strong>{board.title}</strong><small>Archived {formatRelativeDate(board.updatedAt)}</small></span>
												</div>
												<div className="BoardRow-actions">
													<button aria-label={`Restore ${board.title}`} onClick={() => void handleRestore(board)} title="Restore" type="button"><IconRestore aria-hidden="true" size={15} stroke={1.7} /></button>
												</div>
											</article>
										))}
									</div>
								) : null}
							</section>
						) : null}
				</div>
			</section>
			{isCraftWhiteboardImportOpen ? (
				<CraftWhiteboardImportDialog
					boards={boards}
					onClose={() => setIsCraftWhiteboardImportOpen(false)}
					onImport={(request) => {
						posthog?.capture('craft_whiteboard_imported')
						navigate(addCraftWhiteboardImportParameters(
							appRoutes.board(request.boardID),
							request
						))
					}}
				/>
			) : null}
		</main>
	)
}

function FlashcardMarkdown({ children, className }: { children: string; className: string }) {
	return (
		<Streamdown className={className} controls={false} mode="static" plugins={studyMarkdownPlugins}>
			{children}
		</Streamdown>
	)
}

function BoardMeta({ board, courses }: { board: Board; courses: Course[] }) {
	const course = courses.find(({ id }) => id === board.courseID)
	return (
		<small>
			{course ? (
				<span className="BoardRow-course" style={{ '--course-color': course.color } as CSSProperties}>
					<i aria-hidden="true" /> {course.title} ·
				</span>
			) : null}{' '}
			{formatRelativeDate(board.updatedAt)}
		</small>
	)
}

function readSidebarPreference() {
	if (window.matchMedia('(max-width: 840px)').matches) return false
	return getLocalStorageItem(SIDEBAR_STORAGE_KEY) !== 'closed'
}

function getInitial(name: string | null | undefined) {
	return name?.trim().charAt(0).toUpperCase() || 'A'
}

function getFirstName(name: string | null | undefined) {
	const first = name?.trim().split(/\s+/)[0]
	return first ? `, ${first}` : ''
}

function getGreeting() {
	const hour = new Date().getHours()
	if (hour < 5) return 'Working late'
	if (hour < 12) return 'Good morning'
	if (hour < 18) return 'Good afternoon'
	return 'Good evening'
}

function formatRelativeDate(value: string) {
	const date = new Date(value)
	const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
	if (days <= 0) return 'today'
	if (days === 1) return 'yesterday'
	if (days < 7) return `${days} days ago`
	return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}
