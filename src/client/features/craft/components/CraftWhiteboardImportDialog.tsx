import {
	appRoutes,
	craftAPIRoutes,
	type Board,
	type CraftDocumentCandidate,
	type CraftWhiteboardCandidate,
} from '@agentboard/shared'
import {
	IconArrowRight,
	IconBrandCraft,
	IconCheck,
	IconDeviceFloppy,
	IconFileDescription,
	IconLayoutBoard,
	IconLoader2,
	IconSearch,
	IconX,
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../../../lib/api'
import './craftWhiteboardImportDialog.css'

export interface CraftWhiteboardImportRequest {
	boardID: string
	documentID: string
	title: string
	whiteboardBlockID: string
}

export interface CraftWhiteboardImportedItem {
	frameID: string
	title: string
}

interface CraftWhiteboardImportDialogProps {
	boards: Pick<Board, 'id' | 'title'>[]
	importedWhiteboards?: CraftWhiteboardImportedItem[]
	initialBoardID?: string
	onClose: () => void
	onImport: (request: CraftWhiteboardImportRequest) => Promise<void> | void
	onSaveImported?: (frameID: string) => Promise<void>
}

export function CraftWhiteboardImportDialog({
	boards,
	importedWhiteboards = [],
	initialBoardID,
	onClose,
	onImport,
	onSaveImported,
}: CraftWhiteboardImportDialogProps) {
	const [boardID, setBoardID] = useState(initialBoardID ?? boards[0]?.id ?? '')
	const [documents, setDocuments] = useState<CraftDocumentCandidate[]>([])
	const [whiteboards, setWhiteboards] = useState<CraftWhiteboardCandidate[]>([])
	const [selectedDocumentID, setSelectedDocumentID] = useState<string | null>(null)
	const [query, setQuery] = useState('')
	const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
	const [isLoadingWhiteboards, setIsLoadingWhiteboards] = useState(false)
	const [pendingWhiteboardID, setPendingWhiteboardID] = useState<string | null>(null)
	const [savingFrameID, setSavingFrameID] = useState<string | null>(null)
	const [savedFrameID, setSavedFrameID] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const closeButtonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		closeButtonRef.current?.focus()
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	useEffect(() => {
		if (!boardID && boards[0]) setBoardID(boards[0].id)
	}, [boardID, boards])

	useEffect(() => {
		setSelectedDocumentID(null)
		setWhiteboards([])
		const timeout = window.setTimeout(() => void loadDocuments(), 250)
		return () => window.clearTimeout(timeout)
	}, [boardID, query])

	async function loadDocuments() {
		if (!boardID) return
		setError(null)
		setIsLoadingDocuments(true)
		try {
			const response = await apiRequest<{ documents: CraftDocumentCandidate[] }>(
				craftAPIRoutes.boardCandidates(boardID, query)
			)
			setDocuments(response.documents)
		} catch (caught) {
			setDocuments([])
			setError(getErrorMessage(caught))
		} finally {
			setIsLoadingDocuments(false)
		}
	}

	async function selectDocument(documentID: string) {
		setSelectedDocumentID(documentID)
		setWhiteboards([])
		setError(null)
		setIsLoadingWhiteboards(true)
		try {
			const response = await apiRequest<{ whiteboards: CraftWhiteboardCandidate[] }>(
				craftAPIRoutes.boardWhiteboards(boardID, documentID)
			)
			setWhiteboards(response.whiteboards)
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setIsLoadingWhiteboards(false)
		}
	}

	async function importWhiteboard(whiteboard: CraftWhiteboardCandidate) {
		setPendingWhiteboardID(whiteboard.whiteboardBlockID)
		setError(null)
		try {
			await onImport({
				boardID,
				documentID: whiteboard.documentID,
				title: whiteboard.title,
				whiteboardBlockID: whiteboard.whiteboardBlockID,
			})
		} catch (caught) {
			setError(getErrorMessage(caught))
			setPendingWhiteboardID(null)
		}
	}

	async function saveImportedWhiteboard(frameID: string) {
		if (!onSaveImported) return
		setSavingFrameID(frameID)
		setSavedFrameID(null)
		setError(null)
		try {
			await onSaveImported(frameID)
			setSavedFrameID(frameID)
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setSavingFrameID(null)
		}
	}

	const selectedDocument = documents.find(({ documentID }) =>
		documentID === selectedDocumentID
	)
	return createPortal(
		<div
			className="CraftWhiteboard-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				aria-labelledby="craft-whiteboard-title"
				aria-modal="true"
				className="CraftWhiteboard-dialog"
				role="dialog"
			>
				<header className="CraftWhiteboard-header">
					<div className="CraftWhiteboard-brand">
						<span><IconBrandCraft aria-hidden="true" size={20} stroke={1.8} /></span>
						<div>
							<h2 id="craft-whiteboard-title">Import a Craft whiteboard</h2>
							<p>Bring shapes into AgentBoard, edit them, and save common shapes back to Craft.</p>
						</div>
					</div>
					<button
						aria-label="Close Craft whiteboard import"
						onClick={onClose}
						ref={closeButtonRef}
						type="button"
					>
						<IconX aria-hidden="true" size={18} />
					</button>
				</header>

				<div className="CraftWhiteboard-body">
					{importedWhiteboards.length ? (
						<section className="CraftWhiteboard-imported" aria-labelledby="craft-imported-heading">
							<div className="CraftWhiteboard-sectionHeading">
								<h3 id="craft-imported-heading">Imported on this board</h3>
								<span>Manual save keeps Craft changes deliberate.</span>
							</div>
							<div className="CraftWhiteboard-importedList">
								{importedWhiteboards.map((whiteboard) => (
									<div key={whiteboard.frameID}>
										<span>
											<strong>{whiteboard.title}</strong>
											<small>Common shapes, text, arrows, lines, and drawings</small>
										</span>
										<button
											disabled={!onSaveImported || savingFrameID === whiteboard.frameID}
											onClick={() => void saveImportedWhiteboard(whiteboard.frameID)}
											type="button"
										>
											{savingFrameID === whiteboard.frameID
												? <IconLoader2 aria-hidden="true" className="CraftWhiteboard-spinner" size={15} />
												: savedFrameID === whiteboard.frameID
													? <IconCheck aria-hidden="true" size={15} />
													: <IconDeviceFloppy aria-hidden="true" size={15} />}
											{savedFrameID === whiteboard.frameID ? 'Saved' : 'Save to Craft'}
										</button>
									</div>
								))}
							</div>
						</section>
					) : null}

					<div className="CraftWhiteboard-picker">
						<section>
							<div className="CraftWhiteboard-sectionHeading">
								<h3>1. Board</h3>
							</div>
							{boards.length ? (
								<div className="CraftWhiteboard-list">
									{boards.map((board) => (
										<button
											data-selected={board.id === boardID}
											key={board.id}
											onClick={() => setBoardID(board.id)}
											type="button"
										>
											<IconLayoutBoard aria-hidden="true" size={17} stroke={1.7} />
											<span>{board.title}</span>
											{board.id === boardID ? <IconCheck aria-hidden="true" size={15} /> : null}
										</button>
									))}
								</div>
							) : (
								<p className="CraftWhiteboard-empty">Create a board before you import a whiteboard.</p>
							)}
						</section>

						<section>
							<div className="CraftWhiteboard-sectionHeading">
								<h3>2. Craft document</h3>
							</div>
							<label className="CraftWhiteboard-search">
								<IconSearch aria-hidden="true" size={15} stroke={1.8} />
								<span className="sr-only">Search Craft documents</span>
								<input
									disabled={!boardID}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search your Craft space"
									type="search"
									value={query}
								/>
							</label>
							{isLoadingDocuments ? <p className="CraftWhiteboard-empty">Loading documents…</p> : null}
							<div className="CraftWhiteboard-list">
								{documents.map((document) => (
									<button
										data-selected={document.documentID === selectedDocumentID}
										key={document.documentID}
										onClick={() => void selectDocument(document.documentID)}
										type="button"
									>
										<IconFileDescription aria-hidden="true" size={17} stroke={1.7} />
										<span>{document.title}</span>
										<IconArrowRight aria-hidden="true" size={15} />
									</button>
								))}
							</div>
						</section>

						<section>
							<div className="CraftWhiteboard-sectionHeading">
								<h3>3. Whiteboard</h3>
								{selectedDocument ? <span>{selectedDocument.title}</span> : null}
							</div>
							{isLoadingWhiteboards ? <p className="CraftWhiteboard-empty">Finding whiteboards…</p> : null}
							{selectedDocumentID && !isLoadingWhiteboards && !whiteboards.length ? (
								<p className="CraftWhiteboard-empty">This document has no whiteboards.</p>
							) : null}
							{!selectedDocumentID ? (
								<p className="CraftWhiteboard-empty">Choose a document to see its whiteboards.</p>
							) : null}
							<div className="CraftWhiteboard-list">
								{whiteboards.map((whiteboard) => (
									<button
										disabled={pendingWhiteboardID === whiteboard.whiteboardBlockID}
										key={whiteboard.whiteboardBlockID}
										onClick={() => void importWhiteboard(whiteboard)}
										type="button"
									>
										<IconBrandCraft aria-hidden="true" size={17} stroke={1.7} />
										<span>{whiteboard.title}</span>
										{pendingWhiteboardID === whiteboard.whiteboardBlockID
											? <IconLoader2 aria-hidden="true" className="CraftWhiteboard-spinner" size={15} />
											: <IconArrowRight aria-hidden="true" size={15} />}
									</button>
								))}
							</div>
						</section>
					</div>
				</div>

				<footer className="CraftWhiteboard-footer">
					<p>Craft’s whiteboard API is experimental. Images and unsupported Craft-only elements remain unchanged when you save.</p>
					{error ? (
						<p className="CraftWhiteboard-error" role="alert">
							{error} {error.includes('Connect Craft')
								? <a href={appRoutes.settings}>Open Settings</a>
								: null}
						</p>
					) : null}
				</footer>
			</section>
		</div>,
		document.body
	)
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Craft is unavailable right now.'
}
