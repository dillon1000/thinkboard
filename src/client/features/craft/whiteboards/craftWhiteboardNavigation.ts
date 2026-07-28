import type { CraftWhiteboardImportRequest } from '../components/CraftWhiteboardImportDialog'

const DOCUMENT_ID_PARAMETER = 'craftDocumentID'
const WHITEBOARD_ID_PARAMETER = 'craftWhiteboardID'

export function addCraftWhiteboardImportParameters(
	pathname: string,
	request: CraftWhiteboardImportRequest
) {
	const search = new URLSearchParams({
		[DOCUMENT_ID_PARAMETER]: request.documentID,
		[WHITEBOARD_ID_PARAMETER]: request.whiteboardBlockID,
	})
	return `${pathname}?${search}`
}

export function readCraftWhiteboardImportParameters(search: string) {
	const parameters = new URLSearchParams(search)
	const documentID = parameters.get(DOCUMENT_ID_PARAMETER)?.trim()
	const whiteboardBlockID = parameters.get(WHITEBOARD_ID_PARAMETER)?.trim()
	return documentID && whiteboardBlockID ? { documentID, whiteboardBlockID } : null
}

/** Removes one-shot import parameters while retaining unrelated board deep-link parameters. */
export function clearCraftWhiteboardImportParameters() {
	const url = new URL(window.location.href)
	url.searchParams.delete(DOCUMENT_ID_PARAMETER)
	url.searchParams.delete(WHITEBOARD_ID_PARAMETER)
	window.history.replaceState(
		window.history.state,
		'',
		`${url.pathname}${url.search}${url.hash}`
	)
}
