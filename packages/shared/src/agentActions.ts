import { z } from 'zod'

export const canvasRecordSchema = z.object({
	id: z.string(),
	typeName: z.enum(['binding', 'shape']),
}).catchall(z.json())

export const agentActionCreateSchema = z.object({
	afterRecords: z.array(canvasRecordSchema).max(250),
	baseDocumentClock: z.number().int().nonnegative().optional(),
	beforeRecords: z.array(canvasRecordSchema).max(250),
	conversationID: z.string().max(120).optional(),
	planID: z.string().max(120).optional(),
	recordIDs: z.array(z.string().max(160)).max(250),
	toolName: z.string().trim().min(1).max(80),
})

export const agentActionUndoResultSchema = z.object({
	completed: z.boolean(),
})

export interface AgentActionSummary {
	baseDocumentClock?: number
	createdAt: string
	id: string
	planID?: string
	recordIDs: string[]
	status: 'accepted' | 'undoing' | 'undone'
	toolName: string
	undoneAt?: string
}

export interface AgentActionUndoPayload {
	action: AgentActionSummary
	afterRecords: CanvasRecordSnapshot[]
	beforeRecords: CanvasRecordSnapshot[]
}

export type CanvasRecordSnapshot = z.infer<typeof canvasRecordSchema>
export type AgentActionCreate = z.infer<typeof agentActionCreateSchema>
