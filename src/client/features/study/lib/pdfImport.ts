import {
	MAX_PDF_BYTES,
	MAX_PDF_PAGE_IMAGE_BYTES,
	MAX_PDF_PAGES,
	apiRoutes,
	type DocumentStatusResponse,
	type DocumentSummary,
	type PDFTextBlock,
} from '@agentboard/shared'
import type { PDFPageProxy } from 'pdfjs-dist'
import { createShapeId, isShapeId, type Editor } from 'tldraw'
import { loadPDFJS } from './pdfRuntime'

const MAX_RENDER_DIMENSION = 4_096
const MAX_RENDER_PIXELS = 9_000_000
const MAX_RENDER_SCALE = 4
const MIN_RENDER_SCALE = 3
const WEBP_QUALITY = 0.88
const WEBP_FALLBACK_QUALITY = 0.76

type PDFTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>

export interface PDFImportProgress {
	completed: number
	documentID?: string
	stage: 'opening' | 'original' | 'pages' | 'processing' | 'ready'
	total: number
}

interface ImportedPDFPage {
	height: number
	pageNumber: number
	width: number
}

interface PDFPageShapeReference {
	props: object
}

interface SavedImport {
	documentID: string
}

export async function importPDFToBoard(
	boardID: string,
	file: File,
	editor: Editor,
	onProgress: (progress: PDFImportProgress) => void
) {
	if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
		throw new Error('Choose a PDF file to import.')
	}
	if (file.size > MAX_PDF_BYTES) throw new Error('PDF files must be 50 MB or smaller.')

	onProgress({ completed: 0, stage: 'opening', total: 1 })
	const pdfjs = await loadPDFJS()
	const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
	const pdf = await loadingTask.promise
	try {
		if (pdf.numPages > MAX_PDF_PAGES) throw new Error('PDF files must contain 200 pages or fewer.')
		const saved = readSavedImport(boardID, file)
		const matchingDocument = saved
			? null
			: await listBoardDocuments(boardID)
				.then(({ documents }) => findMatchingPDFDocument(documents, file, pdf.numPages))
				.catch(() => null)
		let status = saved || matchingDocument
			? await getDocumentStatus(boardID, saved?.documentID ?? matchingDocument?.id ?? '').catch(() => null)
			: null
		if (
			status &&
			(status.document.byteSize !== file.size || status.document.pageCount !== pdf.numPages)
		) {
			clearSavedImport(boardID, file)
			status = null
		}
		if (!status) {
			onProgress({ completed: 0, stage: 'original', total: 1 })
			const documentID = saved?.documentID ?? crypto.randomUUID()
			writeSavedImport(boardID, file, { documentID })
			status = await createDocument(boardID, documentID, file, pdf.numPages)
		}

		const documentID = status.document.id
		const uploadedPages = matchingDocument
			? new Set<number>()
			: new Set(status.pages.map(({ pageNumber }) => pageNumber))
		const pages: ImportedPDFPage[] = []
		for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
			const page = await pdf.getPage(pageNumber)
			const displayViewport = page.getViewport({ scale: 1 })
			pages.push({
				height: displayViewport.height,
				pageNumber,
				width: displayViewport.width,
			})
			if (!uploadedPages.has(pageNumber)) {
				const rendered = await renderPDFPage(page)
				await uploadDocumentPage(boardID, documentID, pageNumber, rendered)
			}
			page.cleanup()
			onProgress({
				completed: pageNumber,
				documentID,
				stage: 'pages',
				total: pdf.numPages,
			})
			if (pageNumber < pdf.numPages) await yieldToBrowser()
		}

		const finalized = await finalizeDocument(boardID, documentID)
		placePDFPages(editor, finalized.document, pages)
		onProgress({
			completed: pdf.numPages,
			documentID,
			stage: 'processing',
			total: pdf.numPages,
		})
		clearSavedImport(boardID, file)
		return finalized.document
	} finally {
		await loadingTask.destroy()
	}
}

async function renderPDFPage(page: Awaited<ReturnType<import('pdfjs-dist').PDFDocumentProxy['getPage']>>) {
	const displayViewport = page.getViewport({ scale: 1 })
	const renderScale = getPDFRenderScale(
		displayViewport.width,
		displayViewport.height,
		window.devicePixelRatio
	)
	const viewport = page.getViewport({ scale: renderScale })
	const canvas = document.createElement('canvas')
	canvas.width = Math.ceil(viewport.width)
	canvas.height = Math.ceil(viewport.height)
	const context = canvas.getContext('2d', { alpha: false })
	if (!context) throw new Error('This browser cannot render PDF pages.')
	await page.render({ canvas, canvasContext: context, viewport }).promise
	const [image, textItems] = await Promise.all([
		canvasToBlob(canvas),
		readPDFTextItems(page),
	])
	const textBlocks = textItems.flatMap((item): PDFTextBlock[] => {
		const text = Reflect.get(item, 'str')
		const transform = Reflect.get(item, 'transform')
		const width = Reflect.get(item, 'width')
		const height = Reflect.get(item, 'height')
		if (
			typeof text !== 'string' ||
			!Array.isArray(transform) ||
			transform.length < 6 ||
			!transform.every((value) => typeof value === 'number') ||
			typeof width !== 'number' ||
			typeof height !== 'number'
		) return []
		const x = clamp01(transform[4] / displayViewport.width)
		const y = clamp01(1 - transform[5] / displayViewport.height - height / displayViewport.height)
		return [{
			h: clamp01(height / displayViewport.height),
			text,
			w: clamp01(width / displayViewport.width),
			x,
			y,
		}]
	})
	return {
		height: displayViewport.height,
		image,
		text: textBlocks.map(({ text }) => text).join(' ').replace(/\s+/g, ' ').trim(),
		textBlocks,
		width: displayViewport.width,
	}
}

export async function readPDFTextItems(
	page: Pick<PDFPageProxy, 'streamTextContent'>
): Promise<PDFTextContent['items']> {
	const reader = page.streamTextContent().getReader()
	const items: PDFTextContent['items'] = []
	try {
		while (true) {
			const chunk = await reader.read()
			if (chunk.done) return items
			items.push(...chunk.value.items)
		}
	} finally {
		reader.releaseLock()
	}
}

export function getPDFRenderScale(width: number, height: number, devicePixelRatio: number) {
	const pixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
		? devicePixelRatio
		: 1
	const desiredScale = Math.min(
		MAX_RENDER_SCALE,
		Math.max(MIN_RENDER_SCALE, pixelRatio * 2)
	)
	const pixelLimitedScale = Math.sqrt(MAX_RENDER_PIXELS / (width * height))
	const dimensionLimitedScale = MAX_RENDER_DIMENSION / Math.max(width, height)
	return Math.max(0.1, Math.min(desiredScale, pixelLimitedScale, dimensionLimitedScale))
}

async function createDocument(
	boardID: string,
	documentID: string,
	file: File,
	pageCount: number
) {
	return requestDocumentStatus(apiRoutes.boardDocuments(boardID), {
		body: file,
		headers: {
			'content-type': 'application/pdf',
			'x-document-import-id': documentID,
			'x-document-page-count': String(pageCount),
			'x-document-title': encodeURIComponent(file.name),
		},
		method: 'POST',
	})
}

async function uploadDocumentPage(
	boardID: string,
	documentID: string,
	pageNumber: number,
	page: { height: number; image: Blob; text: string; textBlocks: PDFTextBlock[]; width: number }
) {
	const form = new FormData()
	form.set('height', String(page.height))
	form.set('image', page.image, `page-${pageNumber}.${imageExtension(page.image.type)}`)
	form.set('text', page.text)
	form.set('textLayout', JSON.stringify(page.textBlocks))
	form.set('width', String(page.width))
	await requestJSON(apiRoutes.boardDocumentPage(boardID, documentID, pageNumber), {
		body: form,
		method: 'PUT',
	})
}

async function finalizeDocument(boardID: string, documentID: string) {
	return requestDocumentStatus(apiRoutes.boardDocumentComplete(boardID, documentID), {
		method: 'POST',
	})
}

export function getDocumentStatus(boardID: string, documentID: string) {
	return requestDocumentStatus(apiRoutes.boardDocumentStatus(boardID, documentID))
}

export async function retryDocumentProcessing(boardID: string, documentID: string) {
	await requestJSON(apiRoutes.boardDocumentRetry(boardID, documentID), { method: 'POST' })
}

export async function listBoardDocuments(boardID: string) {
	return requestJSON<{ documents: DocumentSummary[] }>(apiRoutes.boardDocuments(boardID))
}

export async function deleteBoardDocument(boardID: string, documentID: string) {
	await requestJSON<{ ok: true }>(apiRoutes.boardDocument(boardID, documentID), {
		method: 'DELETE',
	})
}

/**
 * Removes every canvas page for one stored PDF. A frame is removed with the pages when all of its
 * children belong to that PDF; mixed frames keep their other content.
 */
export function removePDFDocumentShapes(editor: Editor, documentID: string) {
	const pageShapes = editor.getPages().flatMap((page) =>
		[...editor.getPageShapeIds(page)].flatMap((shapeID) => {
			const shape = editor.getShape(shapeID)
			return shape?.type === 'pdf-page' &&
				Reflect.get(shape.props, 'documentId') === documentID
				? [shape]
				: []
		})
	)
	const pageShapeIDs = new Set(pageShapes.map(({ id }) => id))
	const frames = [...new Map(pageShapes.flatMap((shape) => {
		const parent = editor.getShape(shape.parentId)
		if (
			parent?.type !== 'frame' ||
			!editor.getSortedChildIdsForParent(parent.id).every((id) => pageShapeIDs.has(id))
		) return []
		return [[parent.id, parent] as const]
	})).values()]
	const frameIDs = new Set(frames.map(({ id }) => id))
	const shapeIDs = [
		...frameIDs,
		...pageShapes
			.filter(({ parentId }) => !isShapeId(parentId) || !frameIDs.has(parentId))
			.map(({ id }) => id),
	]
	if (!shapeIDs.length) return 0
	editor.markHistoryStoppingPoint('remove pdf')
	editor.deleteShapes(shapeIDs)
	return pageShapes.length
}

/** Selects the first page for a PDF and moves the camera to it, even when it is on another page. */
export function locatePDFDocument(editor: Editor, documentID: string) {
	for (const page of editor.getPages()) {
		for (const shapeID of editor.getPageShapeIds(page)) {
			const shape = editor.getShape(shapeID)
			if (
				shape?.type !== 'pdf-page' ||
				Reflect.get(shape.props, 'documentId') !== documentID
			) continue
			editor.setCurrentPage(page.id)
			editor.setSelectedShapes([shape.id])
			editor.zoomToSelection({ animation: { duration: 300 } })
			return true
		}
	}
	return false
}

export function findMatchingPDFDocument(
	documents: readonly DocumentSummary[],
	file: Pick<File, 'name' | 'size'>,
	pageCount: number
) {
	return documents.find((document) =>
		document.title === file.name &&
		document.byteSize === file.size &&
		document.pageCount === pageCount
	) ?? null
}

export function placePDFPages(
	editor: Editor,
	document: DocumentSummary,
	pages: readonly ImportedPDFPage[]
) {
	const renderVersion = Date.now()
	const existingPageShapes = editor.getPages().flatMap((page) =>
		[...editor.getPageShapeIds(page)].flatMap((shapeID) => {
			const shape = editor.getShape(shapeID)
			return shape?.type === 'pdf-page' &&
				Reflect.get(shape.props, 'documentId') === document.id
				? [shape]
				: []
		})
	)
	if (hasCompletePDFPageShapeSet(existingPageShapes, pages)) {
		editor.updateShapes(existingPageShapes.map((shape) => ({
			id: shape.id,
			props: { renderVersion },
			type: 'pdf-page' as const,
		})))
		return
	}
	const existingPageShapeIDs = new Set(existingPageShapes.map(({ id }) => id))
	const replaceableFrames = [...new Map(existingPageShapes.flatMap((shape) => {
		const parent = editor.getShape(shape.parentId)
		if (
			parent?.type !== 'frame' ||
			!editor
				.getSortedChildIdsForParent(parent.id)
				.every((childID) => existingPageShapeIDs.has(childID))
		) return []
		return [[parent.id, parent] as const]
	})).values()]
	const replaceableFrameIDs = new Set(replaceableFrames.map(({ id }) => id))
	const shapesToDelete = [
		...replaceableFrameIDs,
		...existingPageShapes
			.filter(({ parentId }) =>
				!isShapeId(parentId) || !replaceableFrameIDs.has(parentId)
			)
			.map(({ id }) => id),
	]
	const gutter = 24
	const padding = 28
	const maximumPageWidth = 760
	const laidOutPages = pages.map((page) => {
		const scale = Math.min(1, maximumPageWidth / page.width)
		return { ...page, h: page.height * scale, w: page.width * scale }
	})
	const contentWidth = Math.max(...laidOutPages.map(({ w }) => w))
	const frameWidth = contentWidth + padding * 2
	const frameHeight = laidOutPages.reduce((height, page) => height + page.h, padding * 2 + gutter * Math.max(0, pages.length - 1))
	const viewport = editor.getViewportPageBounds()
	const previousFrame = replaceableFrames[0]
	const origin = previousFrame
		? { x: previousFrame.x, y: previousFrame.y }
		: findOpenFrameOrigin(editor, {
			h: frameHeight,
			w: frameWidth,
			x: viewport.x + viewport.w / 2 - frameWidth / 2,
			y: viewport.y + Math.max(48, viewport.h * 0.08),
		})
	const frameID = createShapeId()
	const pageIDs = laidOutPages.map(() => createShapeId())
	let y = padding
	editor.markHistoryStoppingPoint('import pdf')
	editor.run(() => {
		if (shapesToDelete.length) editor.deleteShapes(shapesToDelete)
		editor.createShape({
			id: frameID,
			type: 'frame',
			x: origin.x,
			y: origin.y,
			props: { h: frameHeight, name: document.title, w: frameWidth },
		})
		editor.createShapes(laidOutPages.map((page, index) => {
			const shape = {
				id: pageIDs[index],
				parentId: frameID,
				props: {
					documentId: document.id,
					h: page.h,
					pageNumber: page.pageNumber,
					renderVersion,
					w: page.w,
				},
				type: 'pdf-page' as const,
				x: padding + (contentWidth - page.w) / 2,
				y,
			}
			y += page.h + gutter
			return shape
		}))
		editor.setSelectedShapes([pageIDs[0]])
	})
	editor.zoomToSelection({ animation: { duration: 300 } })
}

export function hasCompletePDFPageShapeSet(
	existingShapes: readonly PDFPageShapeReference[],
	pages: readonly Pick<ImportedPDFPage, 'pageNumber'>[]
) {
	const expectedPageNumbers = new Set(pages.map(({ pageNumber }) => pageNumber))
	if (existingShapes.length !== expectedPageNumbers.size) return false
	const existingPageNumbers = new Set(existingShapes.map(({ props }) =>
		Reflect.get(props, 'pageNumber')
	))
	return existingPageNumbers.size === expectedPageNumbers.size &&
		[...expectedPageNumbers].every((pageNumber) => existingPageNumbers.has(pageNumber))
}

function findOpenFrameOrigin(
	editor: Editor,
	frame: { h: number; w: number; x: number; y: number }
) {
	const bounds = editor.getCurrentPageShapesSorted().flatMap((shape) => {
		const shapeBounds = editor.getShapePageBounds(shape)
		return shapeBounds ? [shapeBounds] : []
	})
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const candidate = { ...frame, x: frame.x + attempt * (frame.w + 80) }
		if (!bounds.some((existing) => rectanglesIntersect(candidate, existing))) return candidate
	}
	return { ...frame, x: frame.x + 8 * (frame.w + 80) }
}

function rectanglesIntersect(
	a: { h: number; w: number; x: number; y: number },
	b: { h: number; w: number; x: number; y: number }
) {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export async function canvasToBlob(canvas: HTMLCanvasElement) {
	const image = await encodeCanvas(canvas, 'image/webp', WEBP_QUALITY)
	if (image.size <= MAX_PDF_PAGE_IMAGE_BYTES) return image
	return encodeCanvas(canvas, 'image/webp', WEBP_FALLBACK_QUALITY)
}

function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality?: number) {
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => blob ? resolve(blob) : reject(new Error('Unable to render a PDF page image.')),
			type,
			quality
		)
	})
}

function imageExtension(contentType: string) {
	if (contentType === 'image/png') return 'png'
	if (contentType === 'image/jpeg') return 'jpg'
	return 'webp'
}

interface BrowserScheduler {
	yield?: () => Promise<void>
}

export async function yieldToBrowser() {
	const browserScheduler = (globalThis as typeof globalThis & {
		scheduler?: BrowserScheduler
	}).scheduler
	if (browserScheduler?.yield) {
		await browserScheduler.yield()
		return
	}
	await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
}

function clamp01(value: number) {
	return Math.max(0, Math.min(1, value))
}

async function requestDocumentStatus(input: RequestInfo | URL, init?: RequestInit) {
	return requestJSON<DocumentStatusResponse>(input, init)
}

async function requestJSON<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const response = await fetch(input, init)
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null)
		const message = body && typeof body === 'object' && typeof Reflect.get(body, 'error') === 'string'
			? String(Reflect.get(body, 'error'))
			: `Request failed with status ${response.status}`
		throw new Error(message)
	}
	return response.json() as Promise<T>
}

function savedImportKey(boardID: string, file: File) {
	return `agentboard.pdf-import:${boardID}:${file.name}:${file.size}:${file.lastModified}`
}

function readSavedImport(boardID: string, file: File): SavedImport | null {
	try {
		const value = localStorage.getItem(savedImportKey(boardID, file))
		if (!value) return null
		const parsed: unknown = JSON.parse(value)
		const documentID = parsed && typeof parsed === 'object' ? Reflect.get(parsed, 'documentID') : null
		return typeof documentID === 'string' ? { documentID } : null
	} catch {
		return null
	}
}

function writeSavedImport(boardID: string, file: File, value: SavedImport) {
	try {
		localStorage.setItem(savedImportKey(boardID, file), JSON.stringify(value))
	} catch {
		// The import can still restart cleanly when browser storage is unavailable.
	}
}

function clearSavedImport(boardID: string, file: File) {
	try {
		localStorage.removeItem(savedImportKey(boardID, file))
	} catch {
		// No cleanup is needed when browser storage is unavailable.
	}
}
