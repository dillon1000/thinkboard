import { apiRoutes, type DocumentSummary } from '@agentboard/shared'
import {
	IconAlertTriangle,
	IconCircleCheck,
	IconClock,
	IconDownload,
	IconFileTypePdf,
	IconFocusCentered,
	IconRefresh,
	IconTrash,
	IconX,
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from 'tldraw'
import {
	deleteBoardDocument,
	listBoardDocuments,
	locatePDFDocument,
	removePDFDocumentShapes,
	retryDocumentProcessing,
} from '../lib/pdfImport'
import './pdfDocumentLibrary.css'

interface PDFDocumentLibraryProps {
	boardID: string
	editor: Editor | null
	onClose: () => void
	onDocumentsChanged: () => void
}

export function PDFDocumentLibrary({
	boardID,
	editor,
	onClose,
	onDocumentsChanged,
}: PDFDocumentLibraryProps) {
	const [documents, setDocuments] = useState<DocumentSummary[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [pendingDocumentID, setPendingDocumentID] = useState<string | null>(null)
	const closeButtonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		void loadDocuments()
		closeButtonRef.current?.focus()
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [])

	async function loadDocuments() {
		setError(null)
		setIsLoading(true)
		try {
			const response = await listBoardDocuments(boardID)
			setDocuments(response.documents)
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setIsLoading(false)
		}
	}

	function locate(document: DocumentSummary) {
		if (!editor) {
			setError('The board is still loading. Try again.')
			return
		}
		if (!locatePDFDocument(editor, document.id)) {
			setError(`No pages from “${document.title}” are on this canvas.`)
			return
		}
		onClose()
	}

	async function retry(document: DocumentSummary) {
		setPendingDocumentID(document.id)
		setError(null)
		try {
			await retryDocumentProcessing(boardID, document.id)
			await loadDocuments()
			onDocumentsChanged()
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setPendingDocumentID(null)
		}
	}

	async function remove(document: DocumentSummary) {
		const prompt = `Delete “${document.title}” and its canvas pages? This removes the stored PDF, page images, and search index.`
		if (!window.confirm(prompt)) return
		setPendingDocumentID(document.id)
		setError(null)
		try {
			await deleteBoardDocument(boardID, document.id)
			if (editor) removePDFDocumentShapes(editor, document.id)
			setDocuments((current) => current.filter(({ id }) => id !== document.id))
			onDocumentsChanged()
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setPendingDocumentID(null)
		}
	}

	const totalBytes = documents.reduce((total, document) => total + document.byteSize, 0)
	return createPortal(
		<div
			className="PDFLibrary-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				aria-labelledby="pdf-library-title"
				aria-modal="true"
				className="PDFLibrary-dialog"
				role="dialog"
			>
				<header className="PDFLibrary-header">
					<div>
						<span className="PDFLibrary-mark"><IconFileTypePdf aria-hidden="true" size={20} stroke={1.7} /></span>
						<div>
							<h2 id="pdf-library-title">PDF library</h2>
							<p>Manage the source material linked to this board.</p>
						</div>
					</div>
					<button aria-label="Close PDF library" onClick={onClose} ref={closeButtonRef} type="button">
						<IconX aria-hidden="true" size={18} />
					</button>
				</header>

				<div className="PDFLibrary-summary">
					<div><strong>{documents.length}</strong><span>documents</span></div>
					<div><strong>{documents.reduce((total, document) => total + document.pageCount, 0)}</strong><span>pages</span></div>
					<div><strong>{formatBytes(totalBytes)}</strong><span>stored</span></div>
				</div>

				<div className="PDFLibrary-list">
					{isLoading ? <p className="PDFLibrary-empty">Loading PDF documents…</p> : null}
					{!isLoading && documents.length === 0 ? (
						<div className="PDFLibrary-empty">
							<IconFileTypePdf aria-hidden="true" size={28} stroke={1.3} />
							<strong>No PDFs on this board</strong>
							<span>Imported PDFs will appear here with their processing status.</span>
						</div>
					) : null}
					{documents.map((document) => {
						const pending = pendingDocumentID === document.id
						return (
							<article className="PDFLibrary-row" key={document.id}>
								<span className="PDFLibrary-fileIcon"><IconFileTypePdf aria-hidden="true" size={20} stroke={1.6} /></span>
								<div className="PDFLibrary-copy">
									<strong>{document.title}</strong>
									<span>{document.pageCount} pages · {formatBytes(document.byteSize)} · Added {formatDate(document.createdAt)}</span>
									<small data-status={document.status}>
										<StatusIcon status={document.status} />
										{statusLabel(document)}
									</small>
								</div>
								<div className="PDFLibrary-actions">
									{document.status === 'failed' ? (
										<button disabled={pending} onClick={() => void retry(document)} type="button">
											<IconRefresh aria-hidden="true" size={15} /> Retry
										</button>
									) : null}
									<button disabled={!editor} onClick={() => locate(document)} type="button">
										<IconFocusCentered aria-hidden="true" size={15} /> Locate
									</button>
									<a
										href={`${apiRoutes.boardDocumentOriginal(boardID, document.id)}?download=1`}
										title={`Download ${document.title}`}
									>
										<IconDownload aria-hidden="true" size={15} />
										<span className="sr-only">Download {document.title}</span>
									</a>
									<button
										aria-label={`Delete ${document.title}`}
										className="PDFLibrary-delete"
										disabled={pending}
										onClick={() => void remove(document)}
										title="Delete PDF"
										type="button"
									>
										<IconTrash aria-hidden="true" size={15} />
									</button>
								</div>
							</article>
						)
					})}
				</div>
				{error ? <p className="PDFLibrary-error" role="alert">{error}</p> : null}
			</section>
		</div>,
		document.body
	)
}

function StatusIcon({ status }: { status: DocumentSummary['status'] }) {
	if (status === 'ready') return <IconCircleCheck aria-hidden="true" size={13} />
	if (status === 'failed') return <IconAlertTriangle aria-hidden="true" size={13} />
	return <IconClock aria-hidden="true" size={13} />
}

function statusLabel(document: DocumentSummary) {
	if (document.status === 'ready') return 'Ready for study and search'
	if (document.status === 'failed') return document.failureReason ?? 'Processing failed'
	if (document.uploadedPageCount < document.pageCount) {
		return `${document.uploadedPageCount} of ${document.pageCount} pages uploaded`
	}
	return 'Processing text and search index'
}

function formatBytes(bytes: number) {
	if (bytes < 1_024) return `${bytes} B`
	if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`
	return `${(bytes / (1_024 * 1_024)).toFixed(bytes < 10 * 1_024 * 1_024 ? 1 : 0)} MB`
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value))
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'The PDF library is unavailable right now.'
}
