import { T } from '@tldraw/validate'
import { z } from 'zod'

export const MAX_CRAFT_DOCUMENT_LINKS = 20
export const MAX_CRAFT_APPEND_MARKDOWN_LENGTH = 20_000
export const CRAFT_DOCUMENT_SHAPE_TYPE = 'agentboard-craft-document' as const

export interface CraftDocumentShapeProps {
	documentID: string
	h: number
	linkID: string
	schemaVersion: number
	title: string
	w: number
}

export const craftDocumentShapeProps = {
	documentID: T.string,
	h: T.number,
	linkID: T.string,
	schemaVersion: T.positiveInteger,
	title: T.string,
	w: T.number,
}

export const craftDocumentShapeValidator = T.object(craftDocumentShapeProps)

export const craftShapeSchemas = {
	[CRAFT_DOCUMENT_SHAPE_TYPE]: { props: craftDocumentShapeProps },
} as const

export const craftConnectionInputSchema = z.object({
	apiURL: z.string().trim().min(1).max(1_024),
})

export const craftDocumentLinkInputSchema = z.object({
	documentID: z.string().trim().min(1).max(256),
	title: z.string().trim().min(1).max(500),
})

export const craftDocumentAppendInputSchema = z.object({
	linkID: z.string().uuid(),
	markdown: z.string().trim().min(1).max(MAX_CRAFT_APPEND_MARKDOWN_LENGTH),
})

export interface CraftConnectionStatus {
	connected: boolean
	connectedAt: string | null
	spaceName: string | null
}

export interface CraftDocumentCandidate {
	documentID: string
	lastModifiedAt: string | null
	title: string
}

export interface CraftDocumentLink {
	canEdit: boolean
	createdAt: string
	documentID: string
	id: string
	title: string
}

export interface CraftDocumentPreview {
	markdown: string
	title: string
}

export interface CraftDocumentAppendOutput {
	added: boolean
	title: string
}

export const craftAPIRoutes = {
	connection: '/api/integrations/craft',
	boardDocuments: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/craft/documents`,
	boardCandidates: (boardID: string, query = '') => {
		const base = `/api/boards/${encodeURIComponent(boardID)}/craft/candidates`
		return query ? `${base}?q=${encodeURIComponent(query)}` : base
	},
	boardDocument: (boardID: string, linkID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/craft/documents/${encodeURIComponent(linkID)}`,
	boardDocumentPreview: (boardID: string, linkID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/craft/documents/${encodeURIComponent(linkID)}/preview`,
} as const

export function getCraftDocumentCitationHref(linkID: string) {
	return `#craft-document=${encodeURIComponent(linkID)}`
}

export function parseCraftDocumentCitationHref(href: string | undefined) {
	if (!href?.startsWith('#')) return null
	const linkID = new URLSearchParams(href.slice(1)).get('craft-document')?.trim()
	return linkID || null
}
