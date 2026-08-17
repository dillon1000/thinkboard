import { T } from '@tldraw/validate'
import { z } from 'zod'

export const MAX_CRAFT_DOCUMENT_LINKS = 20
export const MAX_CRAFT_APPEND_MARKDOWN_LENGTH = 20_000
// Keeps one agent mutation small enough to review in the model trace and the Craft request body.
export const MAX_CRAFT_BLOCK_UPDATES = 10
// Bounds experimental whiteboard payloads before Thinkspace forwards them to Craft.
export const MAX_CRAFT_WHITEBOARD_ELEMENTS = 1_000
export const CRAFT_WHITEBOARD_CONFLICT_MESSAGE =
	'Craft changed since the last sync. Choose which copy to keep.'
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

export const craftDocumentBlocksUpdateInputSchema = z.object({
	linkID: z.string().uuid(),
	blocks: z.array(z.object({
		id: z.string().trim().min(1).max(256),
		markdown: z.string().min(1).max(MAX_CRAFT_APPEND_MARKDOWN_LENGTH),
	})).min(1).max(MAX_CRAFT_BLOCK_UPDATES),
}).superRefine(({ blocks }, context) => {
	const blockIDs = new Set<string>()
	for (const [index, block] of blocks.entries()) {
		if (blockIDs.has(block.id)) {
			context.addIssue({
				code: 'custom',
				message: 'Block IDs must be unique.',
				path: ['blocks', index, 'id'],
			})
		}
		blockIDs.add(block.id)
	}
})

export type CraftDocumentAppendInput = z.infer<typeof craftDocumentAppendInputSchema>
export type CraftDocumentBlocksUpdateInput = z.infer<typeof craftDocumentBlocksUpdateInputSchema>

const craftWhiteboardElementSchema = z.object({
	id: z.string().trim().min(1).max(256),
	type: z.string().trim().min(1).max(64),
}).catchall(z.json())
export const craftWhiteboardRecordSchema = z.record(z.string(), z.json())
const craftJSONObjectSchema = z.looseObject({})
const craftJSONPrimitiveSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.undefined(),
])

export type CraftWhiteboardRecord = z.infer<typeof craftWhiteboardRecordSchema>
export type CraftJSONValue = z.infer<ReturnType<typeof z.json>>

export const craftWhiteboardSaveInputSchema = z.object({
	elementsToAdd: z.array(craftWhiteboardElementSchema).max(MAX_CRAFT_WHITEBOARD_ELEMENTS),
	elementsToUpdate: z.array(craftWhiteboardElementSchema).max(MAX_CRAFT_WHITEBOARD_ELEMENTS),
	elementIDsToDelete: z.array(
		z.string().trim().min(1).max(256)
	).max(MAX_CRAFT_WHITEBOARD_ELEMENTS),
	expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine(({ elementsToAdd, elementsToUpdate, elementIDsToDelete }, context) => {
	if (!elementsToAdd.length && !elementsToUpdate.length && !elementIDsToDelete.length) {
		context.addIssue({
			code: 'custom',
			message: 'A whiteboard save must add, update, or delete an element.',
		})
	}
	const seen = new Map<string, string>()
	for (const [path, values] of [
		['elementsToAdd', elementsToAdd.map(({ id }) => id)],
		['elementsToUpdate', elementsToUpdate.map(({ id }) => id)],
		['elementIDsToDelete', elementIDsToDelete],
	] as const) {
		for (const [index, value] of values.entries()) {
			const previousPath = seen.get(value)
			if (previousPath) {
				context.addIssue({
					code: 'custom',
					message: previousPath === path
						? 'Whiteboard element IDs must be unique.'
						: 'An element cannot be added, updated, and deleted in one save.',
					path: [path, index],
				})
			}
			seen.set(value, path)
		}
	}
})

export type CraftDocumentBlockUpdate =
	z.infer<typeof craftDocumentBlocksUpdateInputSchema>['blocks'][number]

export const craftConnectionStatusSchema = z.object({
	connected: z.boolean(),
	connectedAt: z.string().nullable(),
	spaceName: z.string().nullable(),
})

export const craftDocumentCandidateSchema = z.object({
	documentID: z.string(),
	lastModifiedAt: z.string().nullable(),
	title: z.string(),
})

export const craftDocumentLinkSchema = z.object({
	canEdit: z.boolean(),
	createdAt: z.string(),
	documentID: z.string(),
	id: z.string(),
	title: z.string(),
})

export const craftDocumentPreviewSchema = z.object({
	markdown: z.string(),
	title: z.string(),
})

export const craftDocumentAppendOutputSchema = z.object({
	added: z.boolean(),
	title: z.string(),
})

export const craftDocumentBlocksUpdateOutputSchema = z.object({
	title: z.string(),
	updated: z.number().int().nonnegative(),
})

export const craftWhiteboardCandidateSchema = z.object({
	documentID: z.string(),
	title: z.string(),
	whiteboardBlockID: z.string(),
})

export const craftWhiteboardImportSchema = z.object({
	appState: craftWhiteboardRecordSchema,
	assets: craftWhiteboardRecordSchema,
	connectionOwnerID: z.string().optional(),
	documentID: z.string(),
	elements: z.array(craftWhiteboardElementSchema),
	revision: z.string(),
	title: z.string(),
	whiteboardBlockID: z.string(),
})

export const craftWhiteboardSaveOutputSchema = z.object({
	added: z.number().int().nonnegative(),
	deleted: z.number().int().nonnegative(),
	revision: z.string(),
	updated: z.number().int().nonnegative(),
})

export type CraftConnectionStatus = z.infer<typeof craftConnectionStatusSchema>
export type CraftDocumentAppendOutput = z.infer<typeof craftDocumentAppendOutputSchema>
export type CraftDocumentBlocksUpdateOutput = z.infer<typeof craftDocumentBlocksUpdateOutputSchema>
export type CraftDocumentCandidate = z.infer<typeof craftDocumentCandidateSchema>
export type CraftDocumentLink = z.infer<typeof craftDocumentLinkSchema>
export type CraftDocumentPreview = z.infer<typeof craftDocumentPreviewSchema>
export type CraftWhiteboardCandidate = z.infer<typeof craftWhiteboardCandidateSchema>
export type CraftWhiteboardElement = z.infer<typeof craftWhiteboardElementSchema>
export type CraftWhiteboardImport = z.infer<typeof craftWhiteboardImportSchema>
export type CraftWhiteboardSaveOutput = z.infer<typeof craftWhiteboardSaveOutputSchema>

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
	boardWhiteboards: (boardID: string, documentID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/craft/whiteboards?documentID=${encodeURIComponent(documentID)}`,
	boardWhiteboard: (boardID: string, documentID: string, whiteboardBlockID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/craft/whiteboards/${encodeURIComponent(whiteboardBlockID)}?documentID=${encodeURIComponent(documentID)}`,
} as const

export function getCraftDocumentCitationHref(linkID: string) {
	return `#craft-document=${encodeURIComponent(linkID)}`
}

export function parseCraftDocumentCitationHref(href: string | undefined) {
	if (!href?.startsWith('#')) return null
	const linkID = new URLSearchParams(href.slice(1)).get('craft-document')?.trim()
	return linkID || null
}

/**
 * Creates a stable revision for Craft's untyped Excalidraw payload. Both the browser and Worker
 * use this value so a save can stop when Craft changed after the last successful sync.
 */
export async function createCraftWhiteboardRevision<Value>(value: Value) {
	const bytes = new TextEncoder().encode(stableJSONStringify(value))
	const digest = await crypto.subtle.digest('SHA-256', bytes)
	return [...new Uint8Array(digest)]
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('')
}

function stableJSONStringify<Value>(value: Value): string {
	const primitive = craftJSONPrimitiveSchema.safeParse(value)
	if (primitive.success) return JSON.stringify(primitive.data) ?? 'null'
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableJSONStringify(item)).join(',')}]`
	}
	const record = craftJSONObjectSchema.parse(value)
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableJSONStringify(record[key])}`)
		.join(',')}}`
}
