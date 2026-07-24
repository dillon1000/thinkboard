import type { LockInReviewResponse } from '@agentboard/shared'
import type { LockInSession } from './lockInSession'

export interface LockInCompletion {
	coach: string
	completedAt: string
	evidence: string
	finishLine: string
	goal: string
	headline: string
}

export function createLockInCompletion(
	session: LockInSession,
	review: LockInReviewResponse
): LockInCompletion | null {
	if (review.status !== 'complete') return null
	return {
		coach: review.coach,
		completedAt: review.reviewedAt,
		evidence: review.evidence,
		finishLine: session.finishLine,
		goal: session.goal,
		headline: review.headline,
	}
}
