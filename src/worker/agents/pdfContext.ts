import type { CanvasContext } from '@agentboard/shared'
import type { Database } from '../db/client'
import {
	getDocumentPageRow,
	getDocumentRow,
	getSelectedDocumentText,
} from '../db/documents'

export async function hydratePDFSelectionContext(
	database: Database,
	authorizedBoardID: string,
	canvasContext: CanvasContext | undefined
) {
	if (!canvasContext) return undefined
	if (canvasContext.boardID !== authorizedBoardID) {
		throw new Error('Canvas context space does not match the authorized space')
	}
	const documentText = canvasContext.pdfTextSelection
		? await hydrateExactPDFTextSelection(
			database,
			authorizedBoardID,
			canvasContext.pdfTextSelection
		)
		: canvasContext.pdfPageRegions?.length
			? await getSelectedDocumentText(database, authorizedBoardID, canvasContext.pdfPageRegions)
			: []
	return {
		...canvasContext,
		documentText,
	}
}

async function hydrateExactPDFTextSelection(
	database: Database,
	boardID: string,
	selection: NonNullable<CanvasContext['pdfTextSelection']>
) {
	const documentRow = await getDocumentRow(database, boardID, selection.documentID)
	if (!documentRow) return []
	const pageRow = await getDocumentPageRow(
		database,
		selection.documentID,
		selection.pageNumber
	)
	if (!pageRow) return []
	return [{
		documentID: documentRow.id,
		documentTitle: documentRow.title,
		pageNumber: selection.pageNumber,
		text: selection.text,
	}]
}
