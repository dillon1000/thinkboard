import { z } from 'zod'

export const LOCK_IN_REVIEW_INTERVAL_OPTIONS = [30, 60, 120, 300] as const
export const DEFAULT_LOCK_IN_REVIEW_INTERVAL_SECONDS = 60
export const MAX_LOCK_IN_IMAGE_DATA_LENGTH = 2_500_000

export const lockInReviewStatusSchema = z.enum([
	'on-track',
	'drifting',
	'stalled',
	'unclear',
	'complete',
])

export const lockInReviewImageSchema = z.object({
	data: z.string().min(1).max(MAX_LOCK_IN_IMAGE_DATA_LENGTH),
	height: z.number().int().positive().max(2_048),
	mediaType: z.literal('image/jpeg'),
	width: z.number().int().positive().max(2_048),
})

export const lockInReviewRequestSchema = z.object({
	canvasImage: lockInReviewImageSchema,
	changedShapeCount: z.number().int().nonnegative().max(500),
	changesImage: lockInReviewImageSchema.optional(),
	elapsedMinutes: z.number().nonnegative().max(1_440),
	finishLine: z.string().trim().min(1).max(200),
	goal: z.string().trim().min(1).max(120),
	intervalSeconds: z.number().int().min(30).max(600),
	sessionID: z.string().min(1).max(120),
})

export const lockInReviewResponseSchema = z.object({
	coach: z.string().trim().min(1).max(400),
	evidence: z.string().trim().min(1).max(280),
	headline: z.string().trim().min(1).max(100),
	reviewedAt: z.string().datetime(),
	status: lockInReviewStatusSchema,
})

export type LockInReviewImage = z.infer<typeof lockInReviewImageSchema>
export type LockInReviewRequest = z.infer<typeof lockInReviewRequestSchema>
export type LockInReviewResponse = z.infer<typeof lockInReviewResponseSchema>
export type LockInReviewStatus = z.infer<typeof lockInReviewStatusSchema>
