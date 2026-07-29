import type { DocumentSummary } from '@agentboard/shared'
import {
	IconBrandCraft,
	IconCheck,
	IconCopy,
	IconFileTypePdf,
	IconLibrary,
	IconRefresh,
	IconX,
} from '@tabler/icons-react'
import type { ChangeEvent, DragEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import type { Editor } from 'tldraw'
import {
	importPDFToBoard,
	listBoardDocuments,
	retryDocumentProcessing,
	type PDFImportProgress,
} from '../lib/pdfImport'
import {
	describePDFImportFailure,
	type PDFImportFailure,
} from '../lib/pdfImportError'
import { useZenMode } from '../../boards/lib/ZenModeProvider'
import { useBoardChrome } from '../../boards/lib/BoardChromeProvider'
import { openCraftDocuments } from '../../craft/craftPreviewEvent'
import { PDFDocumentLibrary } from './PDFDocumentLibrary'
import { requestZenChatPrompt } from '../lib/zenChatPrompt'

interface PDFImportControlProps {
	boardID: string
	editor: Editor | null
}

export function PDFImportControl({ boardID, editor }: PDFImportControlProps) {
	const [progress, setProgress] = useState<PDFImportProgress | null>(null)
	const [error, setError] = useState<PDFImportFailure | null>(null)
	const [failedDocuments, setFailedDocuments] = useState<DocumentSummary[]>([])
	const [processingDocumentCount, setProcessingDocumentCount] = useState(0)
	const [isLibraryOpen, setIsLibraryOpen] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const zen = useZenMode()
	const chrome = useBoardChrome()

	/* Zen hides this button, so the radial menu's PDF petal opens the file picker through here. */
	useEffect(() => {
		zen.registerImportPDF(() => inputRef.current?.click())
		return () => zen.registerImportPDF(null)
	}, [zen])

	const refreshDocuments = useCallback(async () => {
		const response = await listBoardDocuments(boardID)
		setFailedDocuments(response.documents.filter(({ status }) => status === 'failed'))
		setProcessingDocumentCount(response.documents.filter((document) =>
			document.status === 'processing' && document.uploadedPageCount === document.pageCount
		).length)
	}, [boardID])

	useEffect(() => {
		void refreshDocuments().catch(() => undefined)
		if (!processingDocumentCount && (!progress || progress.stage !== 'processing')) return
		const interval = window.setInterval(() => void refreshDocuments().catch(() => undefined), 4_000)
		return () => window.clearInterval(interval)
	}, [processingDocumentCount, progress, refreshDocuments])

	useEffect(() => {
		if (!editor) return
		const container = editor.getContainer()
		const handleDragOver = (event: globalThis.DragEvent) => {
			if (hasPDF(event.dataTransfer?.files)) event.preventDefault()
		}
		const handleDrop = (event: globalThis.DragEvent) => {
			const file = findPDF(event.dataTransfer?.files)
			if (!file) return
			event.preventDefault()
			void importFile(file)
		}
		container.addEventListener('dragover', handleDragOver)
		container.addEventListener('drop', handleDrop)
		return () => {
			container.removeEventListener('dragover', handleDragOver)
			container.removeEventListener('drop', handleDrop)
		}
	}, [editor])

	async function importFile(file: File) {
		if (!editor || progress) return
		setError(null)
		try {
			await importPDFToBoard(boardID, file, editor, setProgress)
			await refreshDocuments()
			window.setTimeout(() => setProgress(null), 2_500)
		} catch (caught) {
			setProgress(null)
			setError(describePDFImportFailure(caught, {
				browser: navigator.userAgent,
				fileName: file.name,
				fileSize: file.size,
				location: window.location.href,
			}))
		}
	}

	function handleFiles(event: ChangeEvent<HTMLInputElement>) {
		const file = findPDF(event.target.files)
		if (file) void importFile(file)
		event.target.value = ''
	}

	async function retry(documentID: string) {
		setError(null)
		try {
			await retryDocumentProcessing(boardID, documentID)
			await refreshDocuments()
		} catch (caught) {
			setError(describePDFImportFailure(caught, {
				browser: navigator.userAgent,
				location: window.location.href,
			}))
		}
	}

	const progressLabel = progress ? formatProgress(progress) : null
	return (
		<div className="PDFImportControl" onDragOver={(event: DragEvent) => event.preventDefault()}>
			<input accept="application/pdf,.pdf" onChange={handleFiles} ref={inputRef} type="file" />
			<button
				className="RibbonMenu-item PDFImportButton"
				disabled={!editor || Boolean(progress)}
				onClick={() => inputRef.current?.click()}
				title="Import PDF pages onto this board"
				type="button"
			>
				<span aria-hidden="true" className="RibbonMenu-itemIcon">
					{progress && progress.stage !== 'ready' ? (
						<ThinkingOrb size={20} state={getProgressOrbState(progress)} />
					) : (
						<IconFileTypePdf size={17} stroke={1.7} />
					)}
				</span>
				<span aria-live="polite">{progressLabel ?? 'Import PDF'}</span>
			</button>
				<button
					className="RibbonMenu-item CraftDocuments-trigger"
					onClick={() => setIsLibraryOpen(true)}
					title="Manage PDFs on this board"
					type="button"
				>
					<span aria-hidden="true" className="RibbonMenu-itemIcon">
						<IconLibrary size={17} stroke={1.7} />
					</span>
					<span>PDF library</span>
				</button>
				<button
					className="RibbonMenu-item CraftDocuments-trigger"
					onClick={openCraftDocuments}
				title="Link Craft documents to this board"
				type="button"
			>
				<span aria-hidden="true" className="RibbonMenu-itemIcon">
					<IconBrandCraft size={17} stroke={1.7} />
				</span>
				<span>Craft documents</span>
			</button>
				{error ? <PDFImportErrorModal error={error} onClose={() => setError(null)} /> : null}
				{isLibraryOpen ? (
					<PDFDocumentLibrary
						boardID={boardID}
						editor={editor}
						onClose={() => setIsLibraryOpen(false)}
						onCreateStudyPack={(document) => {
							requestZenChatPrompt(
								`Create a cited study pack from “${document.title}”. Use only this PDF as the source and include exact page citations.`
							)
							chrome.setStudyOpen(true)
							setIsLibraryOpen(false)
						}}
						onDocumentsChanged={() => void refreshDocuments()}
					/>
				) : null}
			{/* The ribbon has no room for a stack of notices, so they float clear of it. */}
			{failedDocuments.length ? (
				<div className="PDFImportNotices">
					{failedDocuments.map((document) => (
						<div className="PDFImportNotice" key={document.id} role="status">
							<span><strong>{document.title}</strong> needs processing again.</span>
							<button onClick={() => void retry(document.id)} type="button"><IconRefresh size={14} /> Retry</button>
						</div>
					))}
				</div>
			) : null}
		</div>
	)
}

function PDFImportErrorModal({
	error,
	onClose,
}: {
	error: PDFImportFailure
	onClose: () => void
}) {
	const [copied, setCopied] = useState(false)
	const copyButtonRef = useRef<HTMLButtonElement>(null)
	const detailsRef = useRef<HTMLTextAreaElement>(null)

	useEffect(() => {
		copyButtonRef.current?.focus()
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	async function copyError() {
		try {
			if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
			await navigator.clipboard.writeText(error.details)
			setCopied(true)
		} catch {
			detailsRef.current?.focus()
			detailsRef.current?.select()
		}
	}

	return (
		<div className="PDFErrorModalBackdrop">
			<section
				aria-describedby="pdf-error-summary"
				aria-labelledby="pdf-error-title"
				aria-modal="true"
				className="PDFErrorModal"
				role="dialog"
			>
				<header>
					<div>
						<h2 id="pdf-error-title">PDF import error</h2>
						<p id="pdf-error-summary">{error.summary}</p>
					</div>
					<button aria-label="Close PDF import error" onClick={onClose} title="Close" type="button">
						<IconX aria-hidden="true" size={18} />
					</button>
				</header>
				<label>
					<span>Full error details</span>
					<textarea
						aria-label="Full PDF import error details"
						onFocus={(event) => event.currentTarget.select()}
						readOnly
						ref={detailsRef}
						spellCheck={false}
						value={error.details}
					/>
				</label>
				<footer>
					<button className="PDFErrorModal-secondary" onClick={onClose} type="button">Close</button>
					<button
						aria-live="polite"
						className="PDFErrorModal-primary"
						onClick={() => void copyError()}
						ref={copyButtonRef}
						type="button"
					>
						{copied ? <IconCheck aria-hidden="true" size={17} /> : <IconCopy aria-hidden="true" size={17} />}
						{copied ? 'Copied' : 'Copy error'}
					</button>
				</footer>
			</section>
		</div>
	)
}

function formatProgress(progress: PDFImportProgress) {
	if (progress.stage === 'opening') return 'Opening PDF…'
	if (progress.stage === 'original') return 'Saving original…'
	if (progress.stage === 'pages') return `Importing ${progress.completed}/${progress.total}`
	if (progress.stage === 'processing') return 'Pages added · indexing…'
	return 'PDF ready'
}

function getProgressOrbState(progress: PDFImportProgress): OrbState {
	if (progress.stage === 'opening') return 'searching'
	if (progress.stage === 'pages') return 'shaping'
	if (progress.stage === 'processing') return 'searching'
	return 'working'
}

function findPDF(files: FileList | null | undefined) {
	return Array.from(files ?? []).find((file) =>
		file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
	) ?? null
}

function hasPDF(files: FileList | null | undefined) {
	return Boolean(findPDF(files))
}
