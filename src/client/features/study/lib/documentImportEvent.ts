export const OPEN_DOCUMENT_IMPORT_EVENT = 'agentboard:open-document-import'
export const OPEN_DOCUMENT_LIBRARY_EVENT = 'agentboard:open-document-library'

/** Opens the board-owned file input without coupling empty-page UI to the ribbon component. */
export function requestDocumentImport() {
	window.dispatchEvent(new Event(OPEN_DOCUMENT_IMPORT_EVENT))
}

export function requestDocumentLibrary() {
	window.dispatchEvent(new Event(OPEN_DOCUMENT_LIBRARY_EVENT))
}
