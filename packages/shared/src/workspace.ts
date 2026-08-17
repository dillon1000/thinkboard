import { z } from 'zod'

export const boardRoleSchema = z.enum(['owner', 'editor', 'viewer'])
export const invitationRoleSchema = z.enum(['editor', 'viewer'])

const examDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format')
	.refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Use a valid date')

export const courseInputSchema = z.object({
	color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex color'),
	examDate: examDateSchema.nullable(),
	title: z.string().trim().min(1).max(80),
})

export const courseUpdateSchema = courseInputSchema.partial().refine(
	(value) => Object.keys(value).length > 0,
	'Include at least one course field'
)

export const boardCourseUpdateSchema = z.object({
	courseID: z.string().uuid().nullable(),
})

export const spaceInvitationInputSchema = z.object({
	email: z.string().trim().email().max(320).nullable().optional(),
	role: invitationRoleSchema,
})

export const spaceMemberRoleUpdateSchema = z.object({
	role: invitationRoleSchema,
})

export const courseSchema = z.object({
	color: z.string(),
	createdAt: z.string(),
	editable: z.boolean(),
	examDate: z.string().nullable(),
	id: z.string(),
	title: z.string(),
	updatedAt: z.string(),
})

export const spaceInvitationSchema = z.object({
	createdAt: z.string(),
	email: z.string().nullable(),
	expiresAt: z.string(),
	id: z.string(),
	role: invitationRoleSchema,
})

export const spaceInvitationCreatedSchema = spaceInvitationSchema.extend({ token: z.string() })

export const spaceInvitationPreviewSchema = z.object({
	boardTitle: z.string(),
	email: z.string().nullable(),
	expiresAt: z.string(),
	role: invitationRoleSchema,
})

export const spaceMemberSchema = z.object({
	createdAt: z.string(),
	email: z.string(),
	name: z.string(),
	role: boardRoleSchema,
	userID: z.string(),
})

export type BoardRole = z.infer<typeof boardRoleSchema>
export type Course = z.infer<typeof courseSchema>
export type InvitationRole = z.infer<typeof invitationRoleSchema>
export type SpaceInvitation = z.infer<typeof spaceInvitationSchema>
export type SpaceInvitationCreated = z.infer<typeof spaceInvitationCreatedSchema>
export type SpaceInvitationPreview = z.infer<typeof spaceInvitationPreviewSchema>
export type SpaceMember = z.infer<typeof spaceMemberSchema>
