import {
	MAX_CRAFT_DOCUMENT_LINKS,
	appRoutes,
	craftAPIRoutes,
	type CraftDocumentCandidate,
	type CraftDocumentLink,
	type CraftDocumentPreview,
} from '@agentboard/shared'
import {
	IconBrandCraft,
	IconCheck,
	IconExternalLink,
	IconFileDescription,
	IconLayoutDashboard,
	IconPlus,
	IconSearch,
	IconTrash,
	IconX,
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Streamdown } from 'streamdown'
import type { Editor } from 'tldraw'
import { apiRequest } from '../../../lib/api'
import {
	addCraftDocumentShape,
	removeCraftDocumentShapes,
} from '../shapes/CraftDocumentShapeUtil'
import './craftDocumentsDialog.css'

interface CraftDocumentsDialogProps {
	boardID: string
	editor: Editor | null
	initialLinkID: string | null
	onClose: () => void
	onOpenWhiteboards: () => void
}

export function CraftDocumentsDialog({
	boardID,
	editor,
	initialLinkID,
	onClose,
	onOpenWhiteboards,
}: CraftDocumentsDialogProps) {
	const [documents, setDocuments] = useState<CraftDocumentLink[]>([])
	const [candidates, setCandidates] = useState<CraftDocumentCandidate[]>([])
	const [query, setQuery] = useState('')
	const [preview, setPreview] = useState<CraftDocumentPreview | null>(null)
	const [previewLinkID, setPreviewLinkID] = useState<string | null>(initialLinkID)
	const [isLoading, setIsLoading] = useState(true)
	const [isPreviewLoading, setIsPreviewLoading] = useState(Boolean(initialLinkID))
	const [pendingDocumentID, setPendingDocumentID] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [candidateError, setCandidateError] = useState<string | null>(null)
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
		void loadBoardDocuments()
	}, [boardID])

	useEffect(() => {
		const timeout = window.setTimeout(() => void loadCandidates(query), 250)
		return () => window.clearTimeout(timeout)
	}, [boardID, query])

	useEffect(() => {
		if (initialLinkID) void showPreview(initialLinkID)
	}, [initialLinkID])

	async function loadBoardDocuments() {
		setIsLoading(true)
		try {
			const response = await apiRequest<{ documents: CraftDocumentLink[] }>(
				craftAPIRoutes.boardDocuments(boardID)
			)
			setDocuments(response.documents)
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setIsLoading(false)
		}
	}

	async function loadCandidates(searchQuery: string) {
		setCandidateError(null)
		try {
			const response = await apiRequest<{ documents: CraftDocumentCandidate[] }>(
				craftAPIRoutes.boardCandidates(boardID, searchQuery)
			)
			setCandidates(response.documents)
		} catch (caught) {
			setCandidates([])
			setCandidateError(getErrorMessage(caught))
		}
	}

	async function addDocument(candidate: CraftDocumentCandidate) {
		setError(null)
		if (!editor) {
			setError('The board is still loading. Try again.')
			return
		}
		setPendingDocumentID(candidate.documentID)
		try {
			const response = await apiRequest<{ document: CraftDocumentLink }>(
				craftAPIRoutes.boardDocuments(boardID),
				{
					body: JSON.stringify({
						documentID: candidate.documentID,
						title: candidate.title,
					}),
					method: 'POST',
				}
			)
			setDocuments((current) => [
				...current.filter(({ id }) => id !== response.document.id),
				response.document,
			])
			addCraftDocumentShape(editor, response.document)
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setPendingDocumentID(null)
		}
	}

	async function removeDocument(document: CraftDocumentLink) {
		if (!window.confirm(`Remove “${document.title}” from this board? The Craft document will not be deleted.`)) return
		setError(null)
		setPendingDocumentID(document.documentID)
		try {
			await apiRequest(craftAPIRoutes.boardDocument(boardID, document.id), {
				method: 'DELETE',
			})
			if (editor) removeCraftDocumentShapes(editor, document.id)
			setDocuments((current) => current.filter(({ id }) => id !== document.id))
			if (previewLinkID === document.id) {
				setPreview(null)
				setPreviewLinkID(null)
			}
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setPendingDocumentID(null)
		}
	}

	async function showPreview(linkID: string) {
		setError(null)
		setPreview(null)
		setPreviewLinkID(linkID)
		setIsPreviewLoading(true)
		try {
			setPreview(await apiRequest<CraftDocumentPreview>(
				craftAPIRoutes.boardDocumentPreview(boardID, linkID)
			))
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setIsPreviewLoading(false)
		}
	}

	const linkedDocumentIDs = new Set(documents.map(({ documentID }) => documentID))
	return createPortal(
		<div
			className="CraftDocuments-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				aria-labelledby="craft-documents-title"
				aria-modal="true"
				className="CraftDocuments-dialog"
				role="dialog"
			>
				<header className="CraftDocuments-header">
					<div className="CraftDocuments-brand">
						<span><IconBrandCraft aria-hidden="true" size={19} stroke={1.8} /></span>
						<div>
							<h2 id="craft-documents-title">Craft documents</h2>
							<p>Give this board and its study partner access to live notes.</p>
						</div>
					</div>
					<div className="CraftDocuments-headerActions">
						<button onClick={onOpenWhiteboards} type="button">
							<IconLayoutDashboard aria-hidden="true" size={16} />
							Import whiteboard
						</button>
						<button
							aria-label="Close Craft documents"
							onClick={onClose}
							ref={closeButtonRef}
							type="button"
						>
							<IconX aria-hidden="true" size={18} />
						</button>
					</div>
				</header>

				<div className="CraftDocuments-layout">
					<div className="CraftDocuments-browser">
						<section>
							<div className="CraftDocuments-sectionHeading">
								<h3>On this board</h3>
								<span>{documents.length}/{MAX_CRAFT_DOCUMENT_LINKS}</span>
							</div>
							{isLoading ? <p className="CraftDocuments-empty">Loading linked documents…</p> : null}
							{!isLoading && documents.length === 0 ? (
								<p className="CraftDocuments-empty">No Craft documents are linked yet.</p>
							) : null}
							<div className="CraftDocuments-list">
								{documents.map((document) => (
									<div className="CraftDocuments-row" data-selected={previewLinkID === document.id} key={document.id}>
										<button onClick={() => void showPreview(document.id)} type="button">
											<IconFileDescription aria-hidden="true" size={17} stroke={1.7} />
											<span>
												<strong>{document.title}</strong>
												<small>{document.canEdit ? 'You can read and update this document' : 'Shared by a board member'}</small>
											</span>
										</button>
										<button
											aria-label={`Remove ${document.title}`}
											disabled={pendingDocumentID === document.documentID}
											onClick={() => void removeDocument(document)}
											title="Remove from board"
											type="button"
										>
											<IconTrash aria-hidden="true" size={15} stroke={1.8} />
										</button>
									</div>
								))}
							</div>
						</section>

						<section>
							<div className="CraftDocuments-sectionHeading">
								<h3>Add from Craft</h3>
							</div>
							<label className="CraftDocuments-search">
								<IconSearch aria-hidden="true" size={15} stroke={1.8} />
								<span className="sr-only">Search Craft documents</span>
								<input
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search your Craft space"
									type="search"
									value={query}
								/>
							</label>
							{candidateError ? (
								<p className="CraftDocuments-connect">
									{candidateError} <a href={appRoutes.settings}>Open Settings</a>
								</p>
							) : null}
							<div className="CraftDocuments-list CraftDocuments-list--candidates">
								{candidates.map((candidate) => {
									const isLinked = linkedDocumentIDs.has(candidate.documentID)
									return (
										<div className="CraftDocuments-row" key={candidate.documentID}>
											<div>
												<IconFileDescription aria-hidden="true" size={17} stroke={1.7} />
												<span>
													<strong>{candidate.title}</strong>
													<small>{formatModifiedDate(candidate.lastModifiedAt)}</small>
												</span>
											</div>
											<button
												aria-label={isLinked ? `${candidate.title} is linked` : `Add ${candidate.title}`}
												disabled={isLinked || pendingDocumentID === candidate.documentID || documents.length >= MAX_CRAFT_DOCUMENT_LINKS}
												onClick={() => void addDocument(candidate)}
												title={isLinked ? 'Already on this board' : 'Add to board'}
												type="button"
											>
												{isLinked
													? <IconCheck aria-hidden="true" size={15} />
													: <IconPlus aria-hidden="true" size={15} />}
											</button>
										</div>
									)
								})}
							</div>
						</section>
					</div>

					<aside className="CraftDocuments-preview" data-empty={!preview && !isPreviewLoading}>
						{isPreviewLoading ? <p>Loading document…</p> : null}
						{!isPreviewLoading && !preview ? (
							<div>
								<IconFileDescription aria-hidden="true" size={30} stroke={1.4} />
								<strong>Select a document to preview it.</strong>
								<span>The preview reads the current content from Craft.</span>
							</div>
						) : null}
						{preview ? (
							<>
								<header>
									<div>
										<span>Live preview</span>
										<h3>{preview.title}</h3>
									</div>
									<a href="https://docs.craft.do/" rel="noreferrer" target="_blank" title="Open Craft">
										<IconExternalLink aria-hidden="true" size={15} />
									</a>
								</header>
								<Streamdown className="CraftDocuments-markdown" controls={false} mode="static">
									{normalizeCraftMarkdown(preview.markdown)}
								</Streamdown>
							</>
						) : null}
					</aside>
				</div>
				{error ? <p className="CraftDocuments-error" role="alert">{error}</p> : null}
			</section>
		</div>,
		document.body
	)
}

export function normalizeCraftMarkdown(markdown: string) {
	return markdown
		.replace(/<pageTitle>([\s\S]*?)<\/pageTitle>/gi, '# $1')
		.replace(/<highlight(?:\s+color="[^"]*")?>([\s\S]*?)<\/highlight>/gi, '==$1==')
		.replace(/<\/?(?:page|card|content|callout|caption)(?:\s+[^>]*)?>/gi, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

function formatModifiedDate(value: string | null) {
	if (!value) return 'Craft document'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return 'Craft document'
	return `Updated ${new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
	}).format(date)}`
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Craft is unavailable right now.'
}
