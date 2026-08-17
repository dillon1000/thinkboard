import { readProperty } from '@agentboard/shared'
import { hasObjectType, isString } from '@agentboard/shared'
export const CRAFT_DOCUMENT_PREVIEW_EVENT = 'agentboard:craft-document-preview'

export function openCraftDocuments() {
	window.dispatchEvent(new CustomEvent(CRAFT_DOCUMENT_PREVIEW_EVENT, {
		detail: { linkID: null },
	}))
}

export function openCraftDocumentPreview(linkID: string) {
	window.dispatchEvent(new CustomEvent(CRAFT_DOCUMENT_PREVIEW_EVENT, {
		detail: { linkID },
	}))
}

export function readCraftDocumentPreviewEvent(event: Event) {
	if (!(event instanceof CustomEvent)) return undefined
	const detail: unknown = event.detail
	if (!detail || !hasObjectType(detail)) return undefined
	const linkID = readProperty(detail, 'linkID')
	if (linkID === null) return null
	return isString(linkID) && linkID ? linkID : undefined
}
