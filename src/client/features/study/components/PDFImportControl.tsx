import type { DocumentSummary } from '@agentboard/shared'
import { IconFileTypePdf, IconRefresh, IconX } from '@tabler/icons-react'
import type { ChangeEvent, DragEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import {
	importPDFToBoard,
	listBoardDocuments,
	retryDocumentProcessing,
	type PDFImportProgress,
} from '../lib/pdfImport'

interface PDFImportControlProps {
	boardID: string
	editor: Editor | null
}

export function PDFImportControl({ boardID, editor }: PDFImportControlProps) {
	const [progress, setProgress] = useState<PDFImportProgress | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [failedDocuments, setFailedDocuments] = useState<DocumentSummary[]>([])
	const [processingDocumentCount, setProcessingDocumentCount] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)

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
			setError(caught instanceof Error ? caught.message : 'The PDF could not be imported.')
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
			setError(caught instanceof Error ? caught.message : 'Processing could not be retried.')
		}
	}

	const progressLabel = progress ? formatProgress(progress) : null
	return (
		<div className="PDFImportControl" onDragOver={(event: DragEvent) => event.preventDefault()}>
			<input accept="application/pdf,.pdf" onChange={handleFiles} ref={inputRef} type="file" />
			<button
				className="PDFImportButton"
				disabled={!editor || Boolean(progress)}
				onClick={() => inputRef.current?.click()}
				title="Import PDF pages onto this board"
				type="button"
			>
				<IconFileTypePdf aria-hidden="true" size={17} stroke={1.8} />
				<span>{progressLabel ?? 'Import PDF'}</span>
			</button>
			{error ? (
				<div className="PDFImportNotice" role="alert">
					<span>{error}</span>
					<button aria-label="Dismiss PDF import error" onClick={() => setError(null)} type="button"><IconX size={14} /></button>
				</div>
			) : null}
			{failedDocuments.map((document) => (
				<div className="PDFImportNotice" key={document.id} role="status">
					<span><strong>{document.title}</strong> needs processing again.</span>
					<button onClick={() => void retry(document.id)} type="button"><IconRefresh size={14} /> Retry</button>
				</div>
			))}
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

function findPDF(files: FileList | null | undefined) {
	return Array.from(files ?? []).find((file) =>
		file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
	) ?? null
}

function hasPDF(files: FileList | null | undefined) {
	return Boolean(findPDF(files))
}
