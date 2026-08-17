import {
	canvasRecordSchema,
	type AgentActionCreate,
	type AgentActionSummary,
	type AgentActionUndoPayload,
} from '@agentboard/shared'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from './client'
import { agentAction } from './schema'

export async function createAgentAction(
	database: Database,
	boardID: string,
	userID: string,
	input: AgentActionCreate,
	now = new Date()
): Promise<AgentActionSummary> {
	const row = {
		id: crypto.randomUUID(),
		boardID,
		userID,
		conversationID: input.conversationID ?? null,
		toolName: input.toolName,
		planID: input.planID ?? null,
		baseDocumentClock: input.baseDocumentClock ?? null,
		recordIDs: JSON.stringify(input.recordIDs),
		beforeRecords: JSON.stringify(input.beforeRecords),
		afterRecords: JSON.stringify(input.afterRecords),
		status: 'accepted' as const,
		createdAt: now,
		undoStartedAt: null,
		undoneAt: null,
	}
	await database.insert(agentAction).values(row)
	return toSummary(row)
}

export async function listAgentActions(
	database: Database,
	boardID: string,
	userID: string
): Promise<AgentActionSummary[]> {
	const rows = await database.select().from(agentAction)
		.where(and(eq(agentAction.boardID, boardID), eq(agentAction.userID, userID)))
		.orderBy(desc(agentAction.createdAt))
		.limit(100)
	return rows.map(toSummary)
}

/**
 * Claims one accepted action for one undo attempt. The status change blocks a
 * second device from applying the same inverse records at the same time.
 */
export async function claimAgentActionUndo(
	database: Database,
	boardID: string,
	userID: string,
	actionID: string,
	now = new Date()
): Promise<AgentActionUndoPayload | null> {
	const staleClaim = new Date(now.getTime() - 120_000)
	const [row] = await database.update(agentAction)
		.set({ status: 'undoing', undoStartedAt: now })
		.where(and(
			eq(agentAction.id, actionID),
			eq(agentAction.boardID, boardID),
			eq(agentAction.userID, userID),
			or(
				eq(agentAction.status, 'accepted'),
				and(
					eq(agentAction.status, 'undoing'),
					lt(agentAction.undoStartedAt, staleClaim)
				)
			)
		))
		.returning()
	if (!row) return null
	return {
		action: toSummary(row),
		afterRecords: parseRecords(row.afterRecords),
		beforeRecords: parseRecords(row.beforeRecords),
	}
}

/**
 * Completes a claimed undo or releases it after a local version conflict. Only
 * the account that accepted the change can finish its claim.
 */
export async function resolveAgentActionUndo(
	database: Database,
	boardID: string,
	userID: string,
	actionID: string,
	completed: boolean,
	now = new Date()
) {
	const [row] = await database.update(agentAction)
		.set(completed
			? { status: 'undone', undoStartedAt: null, undoneAt: now }
			: { status: 'accepted', undoStartedAt: null, undoneAt: null })
		.where(and(
			eq(agentAction.id, actionID),
			eq(agentAction.boardID, boardID),
			eq(agentAction.userID, userID),
			eq(agentAction.status, 'undoing')
		))
		.returning()
	return row ? toSummary(row) : null
}

function toSummary(row: typeof agentAction.$inferSelect): AgentActionSummary {
	return {
		createdAt: row.createdAt.toISOString(),
		id: row.id,
		recordIDs: parseStringArray(row.recordIDs),
		status: row.status,
		toolName: row.toolName,
		...(row.baseDocumentClock !== null && { baseDocumentClock: row.baseDocumentClock }),
		...(row.planID && { planID: row.planID }),
		...(row.undoneAt && { undoneAt: row.undoneAt.toISOString() }),
	}
}

function parseRecords(value: string) {
	try {
		const records = canvasRecordSchema.array().safeParse(JSON.parse(value))
		return records.success ? records.data : []
	} catch {
		return []
	}
}

function parseStringArray(value: string) {
	try {
		const values = z.array(z.string()).safeParse(JSON.parse(value))
		return values.success ? values.data : []
	} catch {
		return []
	}
}
