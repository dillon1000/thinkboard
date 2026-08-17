import {
	apiRoutes,
	agentActionSummarySchema,
	agentActionUndoPayloadSchema,
	canvasRecordSchema,
	type AgentActionCreate,
	type CanvasRecordSnapshot,
} from '@agentboard/shared'
import { Editor, type TLRecord } from 'tldraw'
import { z } from 'zod'
import { apiRequest } from '../../../lib/api'

interface AgentActionMetadata {
	baseDocumentClock?: number
	conversationID?: string
	planID?: string
	toolName: string
}

interface CanvasRecordLike {
	id: string
	typeName: string
}

export function captureCanvasRecords(editor: Editor) {
	return structuredClone(editor.store.allRecords().filter((record) =>
		record.typeName === 'shape' || record.typeName === 'binding'
	))
}

/**
 * Keeps only records changed by one proposal. The after records also serve as
 * version checks before a later undo, including on a different device.
 */
export function createAgentAction<Record extends CanvasRecordLike>(
	before: readonly Record[],
	after: readonly Record[],
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
			return record ? [canvasRecordSchema.parse(record)] : []
		}),
		beforeRecords: changedIDs.flatMap((id) => {
			const record = beforeByID.get(id)
			return record ? [canvasRecordSchema.parse(record)] : []
		}),
		recordIDs: changedIDs,
	}
}

export async function persistAgentAction(boardID: string, action: AgentActionCreate) {
	return apiRequest(apiRoutes.boardAgentActions(boardID), {
		body: JSON.stringify(action),
		method: 'POST',
	}, z.object({ action: agentActionSummarySchema }))
}

export function rollbackUnpersistedAgentAction(editor: Editor, action: AgentActionCreate) {
	const beforeRecords = parseCanvasRecords(editor, action.beforeRecords)
	const afterRecords = parseCanvasRecords(editor, action.afterRecords)
	assertRecordsUnchanged(editor, beforeRecords, afterRecords)
	restoreRecords(editor, beforeRecords, afterRecords, 'rollback unsaved AI change')
}

export async function listAgentActions(boardID: string) {
	return apiRequest(
		apiRoutes.boardAgentActions(boardID),
		undefined,
		z.object({ actions: z.array(agentActionSummarySchema) })
	)
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
	const payload = await apiRequest(
		apiRoutes.boardAgentActionUndo(boardID, actionID),
		{ method: 'POST' },
		agentActionUndoPayloadSchema
	)
	let completed = false
	try {
		const beforeRecords = parseCanvasRecords(editor, payload.beforeRecords)
		const afterRecords = parseCanvasRecords(editor, payload.afterRecords)
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

export function assertRecordsUnchanged<Record extends CanvasRecordLike>(
	editor: { store: { get(id: Record['id']): object | undefined } },
	beforeRecords: readonly Record[],
	afterRecords: readonly Record[]
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

function parseCanvasRecords(editor: Editor, records: CanvasRecordSnapshot[]): TLRecord[] {
	return canvasRecordSchema.array().parse(records).map((record) => record.typeName === 'shape'
		? editor.store.schema.types.shape.validator.validate(record)
		: editor.store.schema.types.binding.validator.validate(record))
}

function serializeRecord<Value>(record: Value | undefined) {
	return record ? JSON.stringify(record) : ''
}
