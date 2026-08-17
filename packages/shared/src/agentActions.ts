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

export const agentActionSummarySchema = z.object({
	baseDocumentClock: z.number().optional(),
	createdAt: z.string(),
	id: z.string(),
	planID: z.string().optional(),
	recordIDs: z.array(z.string()),
	status: z.enum(['accepted', 'undoing', 'undone']),
	toolName: z.string(),
	undoneAt: z.string().optional(),
})

export const agentActionUndoPayloadSchema = z.object({
	action: agentActionSummarySchema,
	afterRecords: z.array(canvasRecordSchema),
	beforeRecords: z.array(canvasRecordSchema),
})

export type CanvasRecordSnapshot = z.infer<typeof canvasRecordSchema>
export type AgentActionCreate = z.infer<typeof agentActionCreateSchema>
export type AgentActionSummary = z.infer<typeof agentActionSummarySchema>
export type AgentActionUndoPayload = z.infer<typeof agentActionUndoPayloadSchema>
