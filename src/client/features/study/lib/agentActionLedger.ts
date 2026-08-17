import { readProperty } from '@agentboard/shared'
import { hasObjectType, isString } from '@agentboard/shared'
import {
	apiRoutes,
	type AgentActionCreate,
	type AgentActionSummary,
	type AgentActionUndoPayload,
} from '@agentboard/shared'
import { Editor, type TLRecord } from 'tldraw'
import { apiRequest } from '../../../lib/api'

interface AgentActionMetadata {
	baseDocumentClock?: number
	conversationID?: string
	planID?: string
	toolName: string
}

export function captureCanvasRecords(editor: Editor) {
	return structuredClone(editor.store.allRecords().filter(isCanvasRecord))
}

/**
 * Keeps only records changed by one proposal. The after records also serve as
 * version checks before a later undo, including on a different device.
 */
export function createAgentAction(
	before: readonly TLRecord[],
	after: readonly TLRecord[],
	metadata: AgentActionMetadata
): AgentActionCreate | null {
	const beforeByID = new Map(before.map((record) => [record.id, record]))
	const afterByID = new Map(after.map((record) => [record.id, record]))
	const recordIDs = new Set([...beforeByID.keys(), ...afterByID.keys()])
	const changedIDs = [...recordIDs].filter((id) =>
		serializeRecord(beforeByID.get(id)) !== serializeRecord(afterByID.get(id))
	)
	if (!changedIDs.length) return null
	return {
		...metadata,
		afterRecords: changedIDs.flatMap((id) => {
			const record = afterByID.get(id)
			return record ? [record as unknown as Record<string, unknown>] : []
		}),
		beforeRecords: changedIDs.flatMap((id) => {
			const record = beforeByID.get(id)
			return record ? [record as unknown as Record<string, unknown>] : []
		}),
		recordIDs: changedIDs,
	}
}

export async function persistAgentAction(boardID: string, action: AgentActionCreate) {
	return apiRequest<{ action: AgentActionSummary }>(apiRoutes.boardAgentActions(boardID), {
		body: JSON.stringify(action),
		method: 'POST',
	})
}

export function rollbackUnpersistedAgentAction(editor: Editor, action: AgentActionCreate) {
	const beforeRecords = parseCanvasRecords(action.beforeRecords)
	const afterRecords = parseCanvasRecords(action.afterRecords)
	assertRecordsUnchanged(editor, beforeRecords, afterRecords)
	restoreRecords(editor, beforeRecords, afterRecords, 'rollback unsaved AI change')
}

export async function listAgentActions(boardID: string) {
	return apiRequest<{ actions: AgentActionSummary[] }>(apiRoutes.boardAgentActions(boardID))
}

/**
 * Claims, verifies, and applies one inverse record group. A mismatch means an
 * affected shape changed after acceptance, so no local record is changed.
 */
export async function undoAgentAction(
	editor: Editor,
	boardID: string,
	actionID: string
) {
	const payload = await apiRequest<AgentActionUndoPayload>(
		apiRoutes.boardAgentActionUndo(boardID, actionID),
		{ method: 'POST' }
	)
	let completed = false
	try {
		const beforeRecords = parseCanvasRecords(payload.beforeRecords)
		const afterRecords = parseCanvasRecords(payload.afterRecords)
		assertRecordsUnchanged(editor, beforeRecords, afterRecords)
		restoreRecords(editor, beforeRecords, afterRecords, `undo AI change:${actionID}`)
		completed = true
	} finally {
		await apiRequest(apiRoutes.boardAgentActionUndo(boardID, actionID), {
			body: JSON.stringify({ completed }),
			method: 'PATCH',
		})
	}
}

function restoreRecords(
	editor: Editor,
	beforeRecords: readonly TLRecord[],
	afterRecords: readonly TLRecord[],
	historyLabel: string
) {
	const beforeIDs = new Set(beforeRecords.map(({ id }) => id))
	const createdIDs = afterRecords
		.filter(({ id }) => !beforeIDs.has(id))
		.map(({ id }) => id)
	editor.markHistoryStoppingPoint(historyLabel)
	editor.run(() => {
		if (createdIDs.length) editor.store.remove(createdIDs)
		if (beforeRecords.length) editor.store.put([...beforeRecords])
	})
}

export function assertRecordsUnchanged(
	editor: Editor,
	beforeRecords: readonly TLRecord[],
	afterRecords: readonly TLRecord[]
) {
	const afterByID = new Map(afterRecords.map((record) => [record.id, record]))
	for (const record of afterRecords) {
		if (serializeRecord(editor.store.get(record.id)) !== serializeRecord(record)) {
			throw new Error('An affected space item changed after this AI action')
		}
	}
	for (const record of beforeRecords) {
		if (!afterByID.has(record.id) && editor.store.get(record.id)) {
			throw new Error('A deleted space item was restored after this AI action')
		}
	}
}

function parseCanvasRecords(records: Array<Record<string, unknown>>): TLRecord[] {
	if (!records.every(isCanvasRecord)) throw new Error('The saved AI change contains invalid records')
	return records as unknown as TLRecord[]
}

function isCanvasRecord(record: unknown): record is TLRecord {
	if (!record || !hasObjectType(record)) return false
	const typeName = readProperty(record, 'typeName')
	return (typeName === 'shape' || typeName === 'binding') &&
		isString(readProperty(record, 'id'))
}

function serializeRecord(record: TLRecord | undefined) {
	return record ? JSON.stringify(record) : ''
}
