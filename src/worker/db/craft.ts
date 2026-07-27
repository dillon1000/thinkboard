import type { CraftDocumentLink } from '@agentboard/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from './client'
import { craftDocumentLink } from './schema'

export async function listCraftDocumentLinkRows(database: Database, boardID: string) {
	return database
		.select()
		.from(craftDocumentLink)
		.where(eq(craftDocumentLink.boardID, boardID))
		.orderBy(asc(craftDocumentLink.createdAt))
}

export async function getCraftDocumentLinkRow(
	database: Database,
	boardID: string,
	linkID: string
) {
	const [row] = await database
		.select()
		.from(craftDocumentLink)
		.where(and(
			eq(craftDocumentLink.boardID, boardID),
			eq(craftDocumentLink.id, linkID)
		))
		.limit(1)
	return row ?? null
}

/**
 * Links one verified Craft document to a board. The unique board, owner, and document tuple makes
 * repeated add requests idempotent and returns the existing link when the browser retries.
 */
export async function createCraftDocumentLink(
	database: Database,
	input: {
		boardID: string
		connectionOwnerID: string
		documentID: string
		title: string
	}
) {
	const id = crypto.randomUUID()
	await database
		.insert(craftDocumentLink)
		.values({
			...input,
			createdAt: new Date(),
			id,
		})
		.onConflictDoNothing({
			target: [
				craftDocumentLink.boardID,
				craftDocumentLink.connectionOwnerID,
				craftDocumentLink.documentID,
			],
		})

	const [row] = await database
		.select()
		.from(craftDocumentLink)
		.where(and(
			eq(craftDocumentLink.boardID, input.boardID),
			eq(craftDocumentLink.connectionOwnerID, input.connectionOwnerID),
			eq(craftDocumentLink.documentID, input.documentID)
		))
		.limit(1)
	if (!row) throw new Error('Craft document link was not created')
	return row
}

export async function deleteCraftDocumentLink(
	database: Database,
	boardID: string,
	linkID: string
) {
	await database
		.delete(craftDocumentLink)
		.where(and(
			eq(craftDocumentLink.boardID, boardID),
			eq(craftDocumentLink.id, linkID)
		))
}

export function toCraftDocumentLink(
	row: typeof craftDocumentLink.$inferSelect,
	userID: string
): CraftDocumentLink {
	return {
		canEdit: row.connectionOwnerID === userID,
		createdAt: row.createdAt.toISOString(),
		documentID: row.documentID,
		id: row.id,
		title: row.title,
	}
}
