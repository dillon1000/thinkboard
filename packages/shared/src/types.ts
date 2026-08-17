import { z } from 'zod'
import { boardRoleSchema } from './workspace'

export const boardSchema = z.object({
	courseID: z.string().nullable(),
	id: z.string(),
	title: z.string(),
	role: boardRoleSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
})

export const publicConfigSchema = z.object({
	oAuth: z.object({
		enabled: z.boolean(),
		providerID: z.string(),
		providerName: z.string(),
	}),
	spotify: z.object({ enabled: z.boolean() }),
	tldrawLicenseKey: z.string().nullable(),
})

export const studyConversationSchema = z.object({
	agentName: z.string(),
	boardID: z.string(),
	createdAt: z.string(),
	id: z.string(),
	title: z.string(),
	updatedAt: z.string(),
})

export type Board = z.infer<typeof boardSchema>
export type PublicConfig = z.infer<typeof publicConfigSchema>
export type StudyConversation = z.infer<typeof studyConversationSchema>
