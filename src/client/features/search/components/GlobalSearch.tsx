import {
	apiRoutes,
	appRoutes,
	type GlobalSearchResult,
} from '@agentboard/shared'
import {
	IconCards,
	IconFileText,
	IconHeadphones,
	IconLoader2,
	IconMap,
	IconMathFunction,
	IconMessageCircle,
	IconNotes,
	IconQuestionMark,
	IconRoute,
	IconSearch,
	IconShape,
	IconX,
} from '@tabler/icons-react'
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { apiRequest } from '../../../lib/api'
import {
	countGlobalSearchResults,
	filterGlobalSearchResults,
	GLOBAL_SEARCH_FILTERS,
	type GlobalSearchFilter,
} from '../lib/searchFilters'
import './globalSearch.css'

const SEARCH_DELAY_MS = 180

export function GlobalSearch() {
	const [isOpen, setIsOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<GlobalSearchResult[]>([])
	const [filter, setFilter] = useState<GlobalSearchFilter>('all')
	const [activeIndex, setActiveIndex] = useState(0)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const requestID = useRef(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const resultsRef = useRef<HTMLDivElement>(null)
	const navigate = useNavigate()
	const location = useLocation()
	const filteredResults = useMemo(
		() => filterGlobalSearchResults(results, filter),
		[filter, results],
	)
	const filterCounts = useMemo(() => countGlobalSearchResults(results), [results])

	useEffect(() => {
		const openSearch = (event: KeyboardEvent) => {
			if (event.key.toLocaleLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return
			event.preventDefault()
			setIsOpen(true)
		}
		window.addEventListener('keydown', openSearch)
		return () => window.removeEventListener('keydown', openSearch)
	}, [])

	useEffect(() => {
		if (isOpen) window.requestAnimationFrame(() => inputRef.current?.focus())
	}, [isOpen])

	useEffect(() => {
		if (query.trim().length < 2) {
			requestID.current += 1
			setResults([])
			setIsLoading(false)
			setError(null)
			return
		}
		const currentRequestID = requestID.current + 1
		requestID.current = currentRequestID
		setIsLoading(true)
		setResults([])
		setActiveIndex(0)
		setError(null)
		const timer = window.setTimeout(() => {
			void apiRequest<{ results: GlobalSearchResult[] }>(apiRoutes.globalSearch(query))
				.then((response) => {
					if (requestID.current !== currentRequestID) return
					setResults(response.results)
					setActiveIndex(0)
					setError(null)
				})
				.catch((searchError) => {
					if (requestID.current !== currentRequestID) return
					setError(searchError instanceof Error ? searchError.message : 'Search is unavailable')
					setResults([])
				})
				.finally(() => {
					if (requestID.current === currentRequestID) setIsLoading(false)
				})
		}, SEARCH_DELAY_MS)
		return () => window.clearTimeout(timer)
	}, [query])

	useEffect(() => {
		const activeResult = resultsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
		activeResult?.scrollIntoView({ block: 'nearest' })
	}, [activeIndex, filter, filteredResults.length])

	function close() {
		requestID.current += 1
		setIsOpen(false)
		setQuery('')
		setResults([])
		setFilter('all')
		setError(null)
	}

	function openResult(result: GlobalSearchResult) {
		const parameters = new URLSearchParams()
		if (result.kind === 'shape') {
			parameters.set('focusShape', result.shapeID)
		} else if (result.kind === 'lecture-segment') {
			parameters.set('focusLecture', result.lectureID)
			parameters.set('focusTime', String(Math.floor(result.startSecond)))
		} else {
			parameters.set('focusDocument', result.documentID)
			parameters.set('focusPage', String(result.pageNumber))
		}
		navigate(`${appRoutes.board(result.boardID)}?${parameters}`)
		close()
	}

	function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
		if (event.key === 'Escape') {
			event.preventDefault()
			close()
			return
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			if (filteredResults.length) {
				setActiveIndex((current) => Math.min(filteredResults.length - 1, current + 1))
			}
			return
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault()
			setActiveIndex((current) => Math.max(0, current - 1))
			return
		}
		if (event.key === 'Enter' && filteredResults[activeIndex]) {
			event.preventDefault()
			openResult(filteredResults[activeIndex])
		}
	}

	return (
		<>
			{!location.pathname.startsWith('/boards/') ? (
				<button
					className="GlobalSearch-trigger"
					onClick={() => setIsOpen(true)}
					type="button"
				>
					<IconSearch aria-hidden="true" size={14} />
					<span>Search</span>
					<kbd>⌘K</kbd>
				</button>
			) : null}
			{isOpen ? (
				<div
					aria-label="Search all spaces"
					aria-modal="true"
					className="GlobalSearch-backdrop"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) close()
					}}
					role="dialog"
				>
					<section className="GlobalSearch">
						<header>
							<span
								className="GlobalSearch-queryIcon"
								data-loading={isLoading ? 'true' : 'false'}
							>
								<IconSearch aria-hidden="true" className="GlobalSearch-querySearch" size={18} />
								<IconLoader2 aria-hidden="true" className="GlobalSearch-queryLoader" size={18} />
							</span>
							<input
								aria-label="Search notes, PDFs, flashcards, and review notes"
								autoComplete="off"
								onChange={(event) => setQuery(event.target.value)}
								onKeyDown={handleInputKeyDown}
								placeholder="Search notes, PDFs, flashcards…"
								ref={inputRef}
								value={query}
							/>
							<button aria-label="Close search" onClick={close} type="button">
								<IconX aria-hidden="true" size={16} />
							</button>
						</header>
						<nav aria-label="Filter search results" className="GlobalSearch-filters">
							{GLOBAL_SEARCH_FILTERS.map((option) => (
								<button
									aria-pressed={filter === option.id}
									className={filter === option.id ? 'is-active' : ''}
									key={option.id}
									onClick={() => {
										setFilter(option.id)
										setActiveIndex(0)
										window.requestAnimationFrame(() => inputRef.current?.focus())
									}}
									type="button"
								>
									<span>{option.label}</span>
									{results.length ? <small>{filterCounts[option.id]}</small> : null}
								</button>
							))}
						</nav>
						<div className="GlobalSearch-results" ref={resultsRef} role="listbox">
							{!isLoading ? filteredResults.map((result, index) => (
								<button
									aria-selected={index === activeIndex}
									className={index === activeIndex ? 'is-active' : ''}
									data-source={getResultSource(result)}
									key={resultKey(result)}
									onClick={() => openResult(result)}
									onMouseEnter={() => setActiveIndex(index)}
									role="option"
									type="button"
								>
									<span className="GlobalSearch-resultIcon">
										<ResultIcon result={result} />
									</span>
									<span className="GlobalSearch-resultBody">
										<span className="GlobalSearch-resultTitle">
											<strong>{result.title}</strong>
											<span>{getResultTypeLabel(result)}</span>
										</span>
										<small>{result.boardTitle}<i aria-hidden="true" />{getResultLocation(result)}</small>
										<em>{result.snippet}</em>
									</span>
								</button>
							)) : null}
							{isLoading ? <SearchLoadingRows /> : null}
							{error ? <p className="FormError" role="alert">{error}</p> : null}
							{!isLoading && !error && query.trim().length >= 2 && !filteredResults.length ? (
								<p>
									{results.length
										? `No ${GLOBAL_SEARCH_FILTERS.find((option) => option.id === filter)?.label.toLocaleLowerCase()} match this search.`
										: 'No matching study material.'}
								</p>
							) : null}
							{query.trim().length < 2 ? (
								<p>Type two or more characters to search every space.</p>
							) : null}
						</div>
						<footer>
							<span className="GlobalSearch-resultCount" aria-live="polite">
								{query.trim().length >= 2 && !isLoading
									? `${filteredResults.length} ${filteredResults.length === 1 ? 'result' : 'results'}`
									: 'Search every space'}
							</span>
							<span><kbd>↑</kbd><kbd>↓</kbd> move</span>
							<span><kbd>↵</kbd> open</span>
							<span><kbd>esc</kbd> close</span>
						</footer>
					</section>
				</div>
			) : null}
		</>
	)
}

function resultKey(result: GlobalSearchResult) {
	return result.kind === 'shape'
		? `${result.boardID}:${result.shapeID}`
		: result.kind === 'lecture-segment'
			? `${result.boardID}:${result.lectureID}:${result.startSecond}`
		: `${result.boardID}:${result.documentID}:${result.pageNumber}`
}

function formatTimestamp(value: number) {
	const seconds = Math.max(0, Math.floor(value))
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function formatKind(value: string) {
	return value
		.replaceAll('-', ' ')
		.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

function getResultSource(result: GlobalSearchResult) {
	if (result.kind === 'document-page') return 'pdf'
	if (result.kind === 'lecture-segment') return 'lecture'
	return result.artifactKind === 'flashcard' ? 'flashcard' : 'canvas'
}

function getResultTypeLabel(result: GlobalSearchResult) {
	if (result.kind === 'document-page') return 'PDF'
	if (result.kind === 'lecture-segment') return 'Lecture'
	return formatKind(result.artifactKind)
}

function getResultLocation(result: GlobalSearchResult) {
	if (result.kind === 'document-page') return `Page ${result.pageNumber}`
	if (result.kind === 'lecture-segment') return formatTimestamp(result.startSecond)
	return 'Canvas shape'
}

function ResultIcon({ result }: { result: GlobalSearchResult }) {
	if (result.kind === 'document-page') return <IconFileText aria-hidden="true" size={17} />
	if (result.kind === 'lecture-segment') return <IconHeadphones aria-hidden="true" size={17} />
	switch (result.artifactKind) {
		case 'concept-map':
			return <IconMap aria-hidden="true" size={17} />
		case 'equation':
			return <IconMathFunction aria-hidden="true" size={17} />
		case 'flashcard':
			return <IconCards aria-hidden="true" size={17} />
		case 'practice-problem':
		case 'quiz':
			return <IconQuestionMark aria-hidden="true" size={17} />
		case 'review-note':
		case 'note':
			return <IconNotes aria-hidden="true" size={17} />
		case 'teach-back':
			return <IconMessageCircle aria-hidden="true" size={17} />
		case 'walkthrough':
			return <IconRoute aria-hidden="true" size={17} />
		default:
			return <IconShape aria-hidden="true" size={17} />
	}
}

function SearchLoadingRows() {
	return (
		<div aria-label="Searching your spaces" className="GlobalSearch-loading" role="status">
			{[0, 1, 2].map((index) => (
				<div className="GlobalSearch-skeleton" key={index} style={{ '--row': index } as React.CSSProperties}>
					<span />
					<div>
						<i />
						<i />
						<i />
					</div>
				</div>
			))}
		</div>
	)
}
