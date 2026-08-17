import { readProperty } from '@agentboard/shared'
import { PDF_PAGE_SHAPE_TYPE } from '@agentboard/shared'
import type { Editor, TLShape } from 'tldraw'

export interface PDFCitationTarget {
	documentID: string
	pageNumber: number
}

export function parsePDFCitationHref(href: string | undefined): PDFCitationTarget | null {
	if (!href?.startsWith('#pdf-page=')) return null
	const parameters = new URLSearchParams(href.slice(1))
	const documentID = parameters.get('pdf-page')?.trim()
	const pageNumber = Number(parameters.get('page'))
	if (!documentID || !Number.isInteger(pageNumber) || pageNumber < 1) return null
	return { documentID, pageNumber }
}

export function findPDFCitationShape(
	shapes: Iterable<TLShape>,
	target: PDFCitationTarget
) {
	for (const shape of shapes) {
		if (
			shape.type === PDF_PAGE_SHAPE_TYPE &&
			readProperty(shape.props, 'documentId') === target.documentID &&
			readProperty(shape.props, 'pageNumber') === target.pageNumber
		) return shape
	}
	return null
}

export function focusPDFCitation(editor: Editor, target: PDFCitationTarget) {
	const shapes: TLShape[] = []
	for (const page of editor.getPages()) {
		for (const shapeID of editor.getPageShapeIds(page)) {
			const shape = editor.getShape(shapeID)
			if (shape) shapes.push(shape)
		}
	}
	const shape = findPDFCitationShape(shapes, target)
	if (!shape) return false
	const pageID = editor.getAncestorPageId(shape)
	if (pageID && pageID !== editor.getCurrentPageId()) editor.setCurrentPage(pageID)
	editor.setSelectedShapes([shape.id])
	const bounds = editor.getShapePageBounds(shape)
	if (bounds) {
		editor.zoomToBounds(bounds, {
			animation: { duration: 300 },
			inset: 64,
			targetZoom: 1,
		})
	}
	return true
}
