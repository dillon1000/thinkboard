import {
	apiRoutes,
	appRoutes,
	type GlobalSearchResult,
} from '@agentboard/shared'
import { IconFileText, IconSearch, IconShape, IconX } from '@tabler/icons-react'
import {
	useEffect,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { apiRequest } from '../../../lib/api'
import './globalSearch.css'

const SEARCH_DELAY_MS = 180

export function GlobalSearch() {
	const [isOpen, setIsOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<GlobalSearchResult[]>([])
	const [activeIndex, setActiveIndex] = useState(0)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const requestID = useRef(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const navigate = useNavigate()
	const location = useLocation()

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
			setResults([])
			setIsLoading(false)
			setError(null)
			return
		}
		const currentRequestID = requestID.current + 1
		requestID.current = currentRequestID
		setIsLoading(true)
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

	function close() {
		requestID.current += 1
		setIsOpen(false)
		setQuery('')
		setResults([])
		setError(null)
	}

	function openResult(result: GlobalSearchResult) {
		const parameters = new URLSearchParams()
		if (result.kind === 'shape') {
			parameters.set('focusShape', result.shapeID)
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
			setActiveIndex((current) => Math.min(results.length - 1, current + 1))
			return
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault()
			setActiveIndex((current) => Math.max(0, current - 1))
			return
		}
		if (event.key === 'Enter' && results[activeIndex]) {
			event.preventDefault()
			openResult(results[activeIndex])
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
							<IconSearch aria-hidden="true" size={18} />
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
						<div className="GlobalSearch-results" role="listbox">
							{results.map((result, index) => (
								<button
									aria-selected={index === activeIndex}
									className={index === activeIndex ? 'is-active' : ''}
									key={resultKey(result)}
									onClick={() => openResult(result)}
									onMouseEnter={() => setActiveIndex(index)}
									role="option"
									type="button"
								>
									<span className="GlobalSearch-resultIcon">
										{result.kind === 'shape'
											? <IconShape aria-hidden="true" size={16} />
											: <IconFileText aria-hidden="true" size={16} />}
									</span>
									<span className="GlobalSearch-resultBody">
										<strong>{result.title}</strong>
										<small>
											{result.boardTitle}
											{result.kind === 'document-page'
												? ` · page ${result.pageNumber}`
												: ` · ${formatKind(result.artifactKind)}`}
										</small>
										<em>{result.snippet}</em>
									</span>
								</button>
							))}
							{isLoading ? <p role="status">Searching your spaces…</p> : null}
							{error ? <p className="FormError" role="alert">{error}</p> : null}
							{!isLoading && !error && query.trim().length >= 2 && !results.length ? (
								<p>No matching study material.</p>
							) : null}
							{query.trim().length < 2 ? (
								<p>Type two or more characters to search every space.</p>
							) : null}
						</div>
						<footer>
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
		: `${result.boardID}:${result.documentID}:${result.pageNumber}`
}

function formatKind(value: string) {
	return value.replaceAll('-', ' ')
}
