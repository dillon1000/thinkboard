import { z } from 'zod'
import { boardRoleSchema, type BoardRole } from './workspace'

export interface Board {
	courseID: string | null
	id: string
	title: string
	role: BoardRole
	createdAt: string
	updatedAt: string
}

export interface PublicConfig {
	oAuth: {
		enabled: boolean
		providerID: string
		providerName: string
	}
	spotify: {
		enabled: boolean
	}
	tldrawLicenseKey: string | null
}

export interface StudyConversation {
	agentName: string
	boardID: string
	createdAt: string
	id: string
	title: string
	updatedAt: string
}

export const boardSchema: z.ZodType<Board> = z.object({
	courseID: z.string().nullable(),
	id: z.string(),
	title: z.string(),
	role: boardRoleSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
})

export const publicConfigSchema: z.ZodType<PublicConfig> = z.object({
	oAuth: z.object({
		enabled: z.boolean(),
		providerID: z.string(),
		providerName: z.string(),
	}),
	spotify: z.object({ enabled: z.boolean() }),
	tldrawLicenseKey: z.string().nullable(),
})

export const studyConversationSchema: z.ZodType<StudyConversation> = z.object({
	agentName: z.string(),
	boardID: z.string(),
	createdAt: z.string(),
	id: z.string(),
	title: z.string(),
	updatedAt: z.string(),
})
