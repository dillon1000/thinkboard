import { z } from 'zod'

export const CRAFT_DOCUMENT_PREVIEW_EVENT = 'agentboard:craft-document-preview'

const craftDocumentPreviewDetailSchema = z.object({
	linkID: z.string().min(1).nullable(),
})

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
	const detail = craftDocumentPreviewDetailSchema.safeParse(event.detail)
	return detail.success ? detail.data.linkID : undefined
}
