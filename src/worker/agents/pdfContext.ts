import type { CanvasContext } from '@agentboard/shared'
import type { Database } from '../db/client'
import { getSelectedDocumentText } from '../db/documents'

export async function hydratePDFSelectionContext(
	database: Database,
	authorizedBoardID: string,
	canvasContext: CanvasContext | undefined
) {
	if (!canvasContext) return undefined
	if (canvasContext.boardID !== authorizedBoardID) {
		throw new Error('Canvas context board does not match the authorized board')
	}
	const documentText = canvasContext.pdfPageRegions?.length
		? await getSelectedDocumentText(database, authorizedBoardID, canvasContext.pdfPageRegions)
		: []
	return {
		...canvasContext,
		documentText,
	}
}
