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
const craftWhiteboardRecordSchema = z.record(z.string(), z.json())
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
	for (const [path, values] of [
		['elementsToAdd', elementsToAdd.map(({ id }) => id)],
		['elementsToUpdate', elementsToUpdate.map(({ id }) => id)],
		['elementIDsToDelete', elementIDsToDelete],
	] as const) {
		const uniqueValues = new Set<string>()
		for (const [index, value] of values.entries()) {
			if (uniqueValues.has(value)) {
				context.addIssue({
					code: 'custom',
					message: 'Whiteboard element IDs must be unique.',
					path: [path, index],
				})
			}
			uniqueValues.add(value)
		}
	}
	const mutationIDs = [
		...elementsToAdd.map(({ id }) => id),
		...elementsToUpdate.map(({ id }) => id),
		...elementIDsToDelete,
	]
	const duplicateMutationID = mutationIDs.find((id, index) =>
		mutationIDs.indexOf(id) !== index
	)
	if (duplicateMutationID) {
		context.addIssue({
			code: 'custom',
			message: 'An element cannot be added, updated, and deleted in one save.',
		})
	}
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

export type CraftDocumentBlockUpdate =
	z.infer<typeof craftDocumentBlocksUpdateInputSchema>['blocks'][number]

export interface CraftDocumentBlocksUpdateOutput {
	title: string
	updated: number
}

export interface CraftWhiteboardCandidate {
	documentID: string
	title: string
	whiteboardBlockID: string
}

export type CraftWhiteboardElement =
	z.infer<typeof craftWhiteboardElementSchema>

export interface CraftWhiteboardImport {
	appState: CraftWhiteboardRecord
	assets: CraftWhiteboardRecord
	connectionOwnerID?: string
	documentID: string
	elements: CraftWhiteboardElement[]
	revision: string
	title: string
	whiteboardBlockID: string
}

export interface CraftWhiteboardSaveOutput {
	added: number
	deleted: number
	revision: string
	updated: number
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
