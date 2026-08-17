import {
	appRoutes,
	craftAPIRoutes,
	craftDocumentCandidateSchema,
	craftWhiteboardCandidateSchema,
	type Board,
	type CraftDocumentCandidate,
	type CraftWhiteboardCandidate,
} from '@agentboard/shared'
import {
	IconArrowRight,
	IconBrandCraft,
	IconCheck,
	IconFileDescription,
	IconLayoutBoard,
	IconLoader2,
	IconRefresh,
	IconSearch,
	IconX,
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { z } from 'zod'
import { apiRequest } from '../../../lib/api'
import type {
	CraftWhiteboardSyncResolution,
} from '../whiteboards/craftWhiteboardCanvas'
import type {
	CraftWhiteboardSyncStatus,
} from '../whiteboards/useCraftWhiteboardSync'
import './craftWhiteboardImportDialog.css'

export interface CraftWhiteboardImportRequest {
	boardID: string
	documentID: string
	title: string
	whiteboardBlockID: string
}

export interface CraftWhiteboardImportedItem {
	frameID: string
	syncError: string | null
	syncStatus: CraftWhiteboardSyncStatus
	title: string
}

interface CraftWhiteboardImportDialogProps {
	boards: Pick<Board, 'id' | 'title'>[]
	importedWhiteboards?: CraftWhiteboardImportedItem[]
	initialBoardID?: string
	onClose: () => void
	onImport: (request: CraftWhiteboardImportRequest) => Promise<void> | void
	onSyncImported?: (
		frameID: string,
		resolution?: CraftWhiteboardSyncResolution
	) => Promise<void>
}

export function CraftWhiteboardImportDialog({
	boards,
	importedWhiteboards = [],
	initialBoardID,
	onClose,
	onImport,
	onSyncImported,
}: CraftWhiteboardImportDialogProps) {
	const [boardID, setBoardID] = useState(initialBoardID ?? boards[0]?.id ?? '')
	const [documents, setDocuments] = useState<CraftDocumentCandidate[]>([])
	const [whiteboards, setWhiteboards] = useState<CraftWhiteboardCandidate[]>([])
	const [selectedDocumentID, setSelectedDocumentID] = useState<string | null>(null)
	const [query, setQuery] = useState('')
	const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
	const [isLoadingWhiteboards, setIsLoadingWhiteboards] = useState(false)
	const [pendingWhiteboardID, setPendingWhiteboardID] = useState<string | null>(null)
	const [pendingFrameID, setPendingFrameID] = useState<string | null>(null)
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
			const response = await apiRequest(
				craftAPIRoutes.boardCandidates(boardID, query),
				undefined,
				z.object({ documents: z.array(craftDocumentCandidateSchema) })
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
			const response = await apiRequest(
				craftAPIRoutes.boardWhiteboards(boardID, documentID),
				undefined,
				z.object({ whiteboards: z.array(craftWhiteboardCandidateSchema) })
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

	async function syncImportedWhiteboard(
		frameID: string,
		resolution: CraftWhiteboardSyncResolution = 'safe'
	) {
		if (!onSyncImported) return
		setPendingFrameID(frameID)
		setError(null)
		try {
			await onSyncImported(frameID, resolution)
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setPendingFrameID(null)
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
							<p>Import Craft tools as editable Thinkspace shapes and keep them in sync.</p>
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
								<h3 id="craft-imported-heading">Imported in this space</h3>
								<span>Syncs while this space is open. Craft is checked every 30 seconds.</span>
							</div>
							<div className="CraftWhiteboard-importedList">
								{importedWhiteboards.map((whiteboard) => (
									<div
										data-conflict={whiteboard.syncStatus === 'conflict'}
										key={whiteboard.frameID}
									>
										<span>
											<strong>{whiteboard.title}</strong>
											<small data-status={whiteboard.syncStatus}>
												{getSyncStatusLabel(whiteboard)}
											</small>
										</span>
										{whiteboard.syncStatus === 'conflict' ? (
											<div className="CraftWhiteboard-conflictActions">
												<button
													disabled={pendingFrameID === whiteboard.frameID}
													onClick={() => void syncImportedWhiteboard(whiteboard.frameID, 'craft')}
													type="button"
												>
													Use Craft
												</button>
												<button
													disabled={pendingFrameID === whiteboard.frameID}
													onClick={() => void syncImportedWhiteboard(whiteboard.frameID, 'agentboard')}
													type="button"
												>
													Keep Thinkspace
												</button>
											</div>
										) : (
											<button
												disabled={
													!onSyncImported ||
													pendingFrameID === whiteboard.frameID ||
													whiteboard.syncStatus === 'syncing' ||
													whiteboard.syncStatus === 'unavailable'
												}
												onClick={() => void syncImportedWhiteboard(whiteboard.frameID)}
												type="button"
											>
												{whiteboard.syncStatus === 'syncing'
													? <IconLoader2 aria-hidden="true" className="CraftWhiteboard-spinner" size={15} />
													: whiteboard.syncStatus === 'synced'
														? <IconCheck aria-hidden="true" size={15} />
														: <IconRefresh aria-hidden="true" size={15} />}
												{whiteboard.syncStatus === 'syncing'
													? 'Syncing…'
													: whiteboard.syncStatus === 'unavailable'
														? 'Owner syncs'
														: 'Sync now'}
											</button>
										)}
									</div>
								))}
							</div>
						</section>
					) : null}

					<div className="CraftWhiteboard-picker">
						<section>
							<div className="CraftWhiteboard-sectionHeading">
								<h3>1. Space</h3>
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
								<p className="CraftWhiteboard-empty">Create a space before you import a whiteboard.</p>
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
					<p>Craft’s whiteboard API is experimental. Thinkspace syncs supported native tools by element ID and leaves future Craft-only types unchanged.</p>
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

function getErrorMessage<ErrorValue>(error: ErrorValue) {
	return error instanceof Error ? error.message : 'Craft is unavailable right now.'
}

function getSyncStatusLabel(whiteboard: CraftWhiteboardImportedItem) {
	if (whiteboard.syncStatus === 'conflict') return 'Both copies changed · choose which copy to keep'
	if (whiteboard.syncStatus === 'error') return whiteboard.syncError ?? 'Sync stopped'
	if (whiteboard.syncStatus === 'local-changes') return 'Local changes · saving soon'
	if (whiteboard.syncStatus === 'syncing') return 'Syncing…'
	if (whiteboard.syncStatus === 'unavailable') return 'The person who imported this whiteboard keeps it in sync'
	return 'Synced'
}
