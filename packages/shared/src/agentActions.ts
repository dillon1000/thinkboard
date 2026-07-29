import { z } from 'zod'

const canvasRecordSchema = z.record(z.string(), z.unknown())

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
	afterRecords: Array<Record<string, unknown>>
	beforeRecords: Array<Record<string, unknown>>
}

export type AgentActionCreate = z.infer<typeof agentActionCreateSchema>
