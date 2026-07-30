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

export interface LectureSummary {
	byteSize: number
	createdAt: string
	durationSeconds: number | null
	failureReason: string | null
	id: string
	mediaType: string
	status: LectureStatus
	title: string
	updatedAt: string
}

export interface Lecture extends LectureSummary {
	segments: LectureSegment[]
	transcript: string
}

export type LectureSegment = z.infer<typeof lectureSegmentSchema>
export type LectureStatus = z.infer<typeof lectureStatusSchema>
