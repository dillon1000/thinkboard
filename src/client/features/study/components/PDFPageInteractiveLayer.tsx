import { hasObjectType, isNumber, isString } from '@agentboard/shared'
import { apiRoutes } from '@agentboard/shared'
import {
	type ClipboardEvent as ReactClipboardEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from 'react'
import { useEditor, useValue } from 'tldraw'
import type {
	PageViewport,
	PDFDocumentProxy,
	PDFPageProxy,
	TextLayer,
} from 'pdfjs-dist'
import type { TLShapeId } from 'tldraw'
import { focusPDFCitation } from '../lib/pdfCitation'
import { loadPDFJS } from '../lib/pdfRuntime'

interface PDFPageInteractiveLayerProps {
	boardID: string
	documentID: string
	height: number
	pageNumber: number
	shapeID: TLShapeId
	width: number
}

interface PDFPageLink {
	href?: string
	id: string
	pageNumber?: number
	rect: {
		height: number
		left: number
		top: number
		width: number
	}
}

interface PDFLinkAnnotation {
	destination?: string | readonly unknown[]
	id: string
	rect: [number, number, number, number]
	URL?: string
}

const documentPromises = new Map<string, Promise<PDFDocumentProxy>>()
const MIN_PDF_INTERACTION_SCREEN_WIDTH = 320

export function PDFPageInteractiveLayer({
	boardID,
	documentID,
	height,
	pageNumber,
	shapeID,
	width,
}: PDFPageInteractiveLayerProps) {
	const editor = useEditor()
	const interactionIsActive = useValue(
		'PDF page interaction is active',
		() => {
			if (!isPDFInteractionTool(editor.getCurrentToolId())) return false
			const pageBounds = editor.getShapePageBounds(shapeID)
			return shouldEnablePDFPageInteraction({
				isSelected: editor.getSelectedShapeIds().includes(shapeID),
				screenWidth: (pageBounds?.w ?? width) * editor.getZoomLevel(),
			})
		},
		[editor, shapeID, width]
	)
	const textLayerRef = useRef<HTMLDivElement>(null)
	const [links, setLinks] = useState<PDFPageLink[]>([])

	useEffect(() => {
		if (!interactionIsActive) return
		const container = textLayerRef.current
		if (!container || !boardID || !documentID) return
		let cancelled = false
		let textLayer: TextLayer | null = null
		setLinks([])

		const render = async () => {
			const originalURL = apiRoutes.boardDocumentOriginal(boardID, documentID)
			const PDFDocument = await loadPDFDocument(originalURL)
			const page = await PDFDocument.getPage(pageNumber)
			if (cancelled) return
			const unscaledViewport = page.getViewport({ scale: 1 })
			const viewport = page.getViewport({
				scale: Math.min(width / unscaledViewport.width, height / unscaledViewport.height),
			})
			const [pdfjs, pageLinks] = await Promise.all([
				loadPDFJS(),
				getPDFPageLinks(PDFDocument, page, viewport),
			])
			if (cancelled) return

			container.replaceChildren()
			container.style.setProperty('--total-scale-factor', String(viewport.scale))
			textLayer = new pdfjs.TextLayer({
				container,
				textContentSource: page.streamTextContent({
					disableNormalization: true,
					includeMarkedContent: true,
				}),
				viewport,
			})
			await textLayer.render()
			if (!cancelled) setLinks(pageLinks)
		}

		void render().catch(() => {
			if (!cancelled) {
				container.replaceChildren()
				setLinks([])
			}
		})
		return () => {
			cancelled = true
			textLayer?.cancel()
			container.replaceChildren()
		}
	}, [boardID, documentID, height, interactionIsActive, pageNumber, width])

	if (!interactionIsActive) return null

	return (
		<>
			<div
				aria-label={`Selectable text for PDF page ${pageNumber}`}
				className="PDFPageTextLayer"
				data-document-id={documentID}
				data-page-number={pageNumber}
				data-pdf-text-layer="true"
				onCopy={handlePDFTextCopy}
				onKeyDown={handlePDFTextKeyDown}
				onPointerDown={beginPDFTextSelection}
				ref={textLayerRef}
				tabIndex={-1}
			/>
			<div className="PDFPageLinkLayer">
				{links.map((link) => {
					const style = {
						height: `${link.rect.height * 100}%`,
						left: `${link.rect.left * 100}%`,
						top: `${link.rect.top * 100}%`,
						width: `${link.rect.width * 100}%`,
					}
					if (link.href) {
						return (
							<a
								aria-label={`Open PDF link to ${link.href}`}
								className="PDFPageLink"
								href={link.href}
								key={link.id}
								onClick={stopCanvasInteraction}
								onPointerDown={stopCanvasInteraction}
								rel="noopener noreferrer"
								style={style}
								target="_blank"
							/>
						)
					}
					if (link.pageNumber) {
						return (
							<button
								aria-label={`Go to PDF page ${link.pageNumber}`}
								className="PDFPageLink"
								key={link.id}
								onClick={(event) => {
									stopCanvasInteraction(event)
									focusPDFCitation(editor, {
										documentID,
										pageNumber: link.pageNumber ?? 1,
									})
								}}
								onPointerDown={stopCanvasInteraction}
								style={style}
								type="button"
							/>
						)
					}
					return null
				})}
			</div>
		</>
	)
}

async function loadPDFDocument(URL: string) {
	const existing = documentPromises.get(URL)
	if (existing) return existing
	const pending = loadPDFJS()
		.then((pdfjs) => {
			return pdfjs.getDocument({ url: URL }).promise
		})
		.catch((error: unknown) => {
			documentPromises.delete(URL)
			throw error
		})
	documentPromises.set(URL, pending)
	return pending
}

async function getPDFPageLinks(
	PDFDocument: PDFDocumentProxy,
	page: PDFPageProxy,
	viewport: PageViewport
) {
	const rawAnnotations: unknown = await page.getAnnotations({ intent: 'display' })
	if (!Array.isArray(rawAnnotations)) return []
	const annotations = rawAnnotations.flatMap((value, index) => {
		const annotation = parsePDFLinkAnnotation(value, index)
		return annotation ? [annotation] : []
	})
	return Promise.all(annotations.map(async (annotation): Promise<PDFPageLink | null> => {
		const rect = normalizeAnnotationRect(viewport, annotation.rect)
		if (!rect) return null
		if (annotation.URL) {
			const href = getClickablePDFURL(annotation.URL)
			return href ? { href, id: annotation.id, rect } : null
		}
		if (!annotation.destination) return null
		const destinationPageNumber = await resolveDestinationPageNumber(
			PDFDocument,
			annotation.destination
		)
		return destinationPageNumber
			? { id: annotation.id, pageNumber: destinationPageNumber, rect }
			: null
	})).then((values) => values.filter((value): value is PDFPageLink => value !== null))
}

function parsePDFLinkAnnotation(value: unknown, index: number): PDFLinkAnnotation | null {
	if (!value || !hasObjectType(value)) return null
	const subtype = Reflect.get(value, 'subtype')
	const rawRect = Reflect.get(value, 'rect')
	if (subtype !== 'Link' || !isPDFRectangle(rawRect)) return null
	const rawID = Reflect.get(value, 'id')
	const rawURL = Reflect.get(value, 'url')
	const rawDestination = Reflect.get(value, 'dest')
	const destination = isString(rawDestination) || Array.isArray(rawDestination)
		? rawDestination
		: undefined
	return {
		...(destination ? { destination } : {}),
		id: isString(rawID) ? rawID : `link-${index}`,
		rect: rawRect,
		...(isString(rawURL) ? { URL: rawURL } : {}),
	}
}

function isPDFRectangle(value: unknown): value is [number, number, number, number] {
	return Array.isArray(value) &&
		value.length === 4 &&
		value.every((coordinate) => isNumber(coordinate) && Number.isFinite(coordinate))
}

function normalizeAnnotationRect(
	viewport: PageViewport,
	rect: [number, number, number, number]
) {
	const firstPoint = viewport.convertToViewportPoint(rect[0], rect[1])
	const secondPoint = viewport.convertToViewportPoint(rect[2], rect[3])
	const left = Math.min(firstPoint[0], secondPoint[0]) / viewport.width
	const right = Math.max(firstPoint[0], secondPoint[0]) / viewport.width
	const top = Math.min(firstPoint[1], secondPoint[1]) / viewport.height
	const bottom = Math.max(firstPoint[1], secondPoint[1]) / viewport.height
	if (![left, right, top, bottom].every(Number.isFinite)) return null
	return {
		height: clamp01(bottom) - clamp01(top),
		left: clamp01(left),
		top: clamp01(top),
		width: clamp01(right) - clamp01(left),
	}
}

export function getClickablePDFURL(value: string) {
	try {
		const URL = new globalThis.URL(value)
		return ['http:', 'https:', 'mailto:', 'tel:'].includes(URL.protocol) ? URL.href : null
	} catch {
		return null
	}
}

async function resolveDestinationPageNumber(
	PDFDocument: PDFDocumentProxy,
	destination: string | readonly unknown[]
) {
	const explicitDestination = isString(destination)
		? await PDFDocument.getDestination(destination)
		: destination
	const pageReference = explicitDestination?.[0]
	if (isNumber(pageReference) && Number.isInteger(pageReference)) {
		const pageNumber = pageReference + 1
		return pageNumber <= PDFDocument.numPages ? pageNumber : null
	}
	if (!isPDFPageReference(pageReference)) return null
	const pageNumber = await PDFDocument.getPageIndex(pageReference) + 1
	return pageNumber <= PDFDocument.numPages ? pageNumber : null
}

function isPDFPageReference(value: unknown): value is { gen: number; num: number } {
	return Boolean(
		value &&
		hasObjectType(value) &&
		isNumber(Reflect.get(value, 'num')) &&
		isNumber(Reflect.get(value, 'gen'))
	)
}

function clamp01(value: number) {
	return Math.max(0, Math.min(1, value))
}

function beginPDFTextSelection(event: ReactPointerEvent<HTMLDivElement>) {
	event.stopPropagation()
	event.currentTarget.focus({ preventScroll: true })
}

function handlePDFTextCopy(event: ReactClipboardEvent<HTMLDivElement>) {
	if (!hasPDFTextSelection(event.currentTarget)) return
	event.stopPropagation()
}

function handlePDFTextKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
	if (!isPDFCopyShortcut(event) || !hasPDFTextSelection(event.currentTarget)) return
	event.stopPropagation()
}

function hasPDFTextSelection(container: HTMLDivElement) {
	const selection = container.ownerDocument.getSelection()
	return Boolean(
		selection &&
		!selection.isCollapsed &&
		selection.anchorNode &&
		selection.focusNode &&
		container.contains(selection.anchorNode) &&
		container.contains(selection.focusNode)
	)
}

export function isPDFCopyShortcut(
	event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>
) {
	return (event.metaKey || event.ctrlKey) &&
		!event.altKey &&
		!event.shiftKey &&
		event.key.toLowerCase() === 'c'
}

export function isPDFInteractionTool(toolID: string) {
	return toolID === 'select'
}

export function shouldEnablePDFPageInteraction({
	isSelected,
	screenWidth,
}: {
	isSelected: boolean
	screenWidth: number
}) {
	return isSelected || screenWidth >= MIN_PDF_INTERACTION_SCREEN_WIDTH
}

function stopCanvasInteraction(event: { stopPropagation: () => void }) {
	event.stopPropagation()
}
