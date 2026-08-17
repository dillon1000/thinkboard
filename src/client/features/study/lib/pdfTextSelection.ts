import type { CanvasPDFTextSelection } from '@agentboard/shared'

const MAX_PDF_TEXT_SELECTION_LENGTH = 8_000
const PDF_CONTEXT_HIGHLIGHT_NAME = 'agentboard-pdf-context'

let retainedPDFTextSelection: CanvasPDFTextSelection | undefined

export function capturePDFTextSelection(
	selection: Selection | null = globalThis.document?.getSelection() ?? null
): CanvasPDFTextSelection | undefined {
	const activeSelection = readActivePDFTextSelection(selection)
	retainedPDFTextSelection = resolvePDFTextSelection(
		activeSelection,
		retainedPDFTextSelection,
		Boolean(selection && !selection.isCollapsed)
	)
	if (activeSelection && selection?.rangeCount) {
		setPersistentPDFHighlight(selection.getRangeAt(0).cloneRange())
	} else if (selection && !selection.isCollapsed) {
		deletePersistentPDFHighlight()
	}
	return retainedPDFTextSelection
}

export function clearPDFTextSelection() {
	retainedPDFTextSelection = undefined
	deletePersistentPDFHighlight()
}

export function resolvePDFTextSelection(
	activeSelection: CanvasPDFTextSelection | undefined,
	retainedSelection: CanvasPDFTextSelection | undefined,
	hasNonCollapsedSelection: boolean
) {
	if (activeSelection) return activeSelection
	return hasNonCollapsedSelection ? undefined : retainedSelection
}

export function normalizePDFTextSelection(
	documentID: string | undefined,
	rawPageNumber: string | undefined,
	rawText: string
): CanvasPDFTextSelection | undefined {
	const pageNumber = Number(rawPageNumber)
	const text = rawText.replace(/\s+/g, ' ').trim().slice(0, MAX_PDF_TEXT_SELECTION_LENGTH)
	if (
		!documentID ||
		!Number.isInteger(pageNumber) ||
		pageNumber < 1 ||
		pageNumber > 200 ||
		!text
	) return undefined
	return { documentID, pageNumber, text }
}

function getPDFTextLayer(node: Node) {
	const element = node.nodeType === 1 ? node as Element : node.parentElement
	return element?.closest<HTMLElement>('[data-pdf-text-layer="true"]') ?? null
}

function readActivePDFTextSelection(selection: Selection | null) {
	if (
		!selection ||
		selection.isCollapsed ||
		!selection.anchorNode ||
		!selection.focusNode
	) return undefined
	const anchorLayer = getPDFTextLayer(selection.anchorNode)
	const focusLayer = getPDFTextLayer(selection.focusNode)
	if (!anchorLayer || anchorLayer !== focusLayer) return undefined
	return normalizePDFTextSelection(
		anchorLayer.getAttribute('data-document-id') ?? undefined,
		anchorLayer.getAttribute('data-page-number') ?? undefined,
		selection.toString()
	)
}

interface PDFHighlightRegistry {
	delete(name: string): boolean
	set(name: string, highlight: Highlight): PDFHighlightRegistry
}

function getPDFHighlightRegistry() {
	if (
		!globalThis.CSS ||
		!('Highlight' in globalThis) ||
		!('highlights' in CSS)
	) return null
	const css: { highlights?: PDFHighlightRegistry } = CSS
	return css.highlights ?? null
}

function setPersistentPDFHighlight(range: Range) {
	getPDFHighlightRegistry()?.set(PDF_CONTEXT_HIGHLIGHT_NAME, new Highlight(range))
}

function deletePersistentPDFHighlight() {
	getPDFHighlightRegistry()?.delete(PDF_CONTEXT_HIGHLIGHT_NAME)
}
