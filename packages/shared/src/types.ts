import { z } from 'zod'
import { boardRoleSchema } from './workspace'

export const boardNoteModeSchema = z.enum(['canvas', 'pages'])
export const pageOrientationSchema = z.enum(['portrait', 'landscape'])
export const pageTextureSchema = z.enum(['blank', 'lined', 'grid', 'dots'])

export const boardSchema = z.object({
	courseID: z.string().nullable(),
	id: z.string(),
	noteMode: boardNoteModeSchema,
	pageOrientation: pageOrientationSchema,
	pageTexture: pageTextureSchema,
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
export type BoardNoteMode = z.infer<typeof boardNoteModeSchema>
export type PageOrientation = z.infer<typeof pageOrientationSchema>
export type PageTexture = z.infer<typeof pageTextureSchema>
export type PublicConfig = z.infer<typeof publicConfigSchema>
export type StudyConversation = z.infer<typeof studyConversationSchema>
