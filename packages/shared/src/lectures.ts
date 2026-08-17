import { z } from 'zod'

export const MAX_AUDIO_BYTES = 20 * 1_024 * 1_024
export const lectureStatusSchema = z.enum(['processing', 'ready', 'failed'])

export const lectureSegmentSchema = z.object({
	end: z.number().nonnegative(),
	start: z.number().nonnegative(),
	text: z.string().trim().min(1).max(4_000),
}).refine(({ end, start }) => end >= start, {
	message: 'The segment end must follow its start',
})

export const lectureSummarySchema = z.object({
	byteSize: z.number().int().nonnegative(),
	createdAt: z.string(),
	durationSeconds: z.number().nonnegative().nullable(),
	failureReason: z.string().nullable(),
	id: z.string().min(1),
	mediaType: z.string().min(1),
	status: lectureStatusSchema,
	title: z.string().min(1),
	updatedAt: z.string(),
})

export type LectureSummary = z.infer<typeof lectureSummarySchema>

export interface Lecture extends LectureSummary {
	segments: LectureSegment[]
	transcript: string
}

export const lectureSchema: z.ZodType<Lecture> = lectureSummarySchema.extend({
	segments: z.array(lectureSegmentSchema),
	transcript: z.string(),
})

export type LectureSegment = z.infer<typeof lectureSegmentSchema>
export type LectureStatus = z.infer<typeof lectureStatusSchema>
