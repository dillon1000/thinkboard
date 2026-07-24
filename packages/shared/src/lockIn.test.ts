import { describe, expect, it } from 'vitest'
import {
	lockInReviewRequestSchema,
	lockInReviewResponseSchema,
} from './lockIn'

describe('Lock In review contracts', () => {
	it('accepts a bounded two-image review request', () => {
		expect(lockInReviewRequestSchema.safeParse({
			canvasImage: {
				data: 'ZmFrZQ==',
				height: 720,
				mediaType: 'image/jpeg',
				width: 1_024,
			},
			changedShapeCount: 3,
			changesImage: {
				data: 'Y2hhbmdlcw==',
				height: 360,
				mediaType: 'image/jpeg',
				width: 640,
			},
			elapsedMinutes: 4.5,
			finishLine: 'One complete proof with every step justified',
			goal: 'Finish the induction proof',
			intervalSeconds: 60,
			sessionID: 'session-1',
		}).success).toBe(true)
	})

	it('requires actionable, bounded coach output', () => {
		expect(lockInReviewResponseSchema.safeParse({
			coach: 'Finish the induction step before adding another example.',
			evidence: 'The latest edits expand the base case but leave the induction step blank.',
			headline: 'Return to the induction step',
			reviewedAt: '2026-07-23T18:00:00.000Z',
			status: 'drifting',
		}).success).toBe(true)
	})

	it('accepts a completed finish-line verdict', () => {
		expect(lockInReviewResponseSchema.safeParse({
			coach: 'You reached the finish line—take the win.',
			evidence: 'The canvas now contains the requested labeled graph and complete explanation.',
			headline: 'Goal complete',
			reviewedAt: '2026-07-23T18:00:00.000Z',
			status: 'complete',
		}).success).toBe(true)
	})
})
