import { describe, expect, it } from 'vitest'
import { createLockInCompletion } from './lockInCompletion'
import { createLockInSession } from './lockInSession'

const session = createLockInSession({
	durationMinutes: 45,
	finishLine: 'A complete proof with a checked base case',
	goal: 'Finish the induction proof',
	playlistEnabled: false,
	redirectWhenDrifting: true,
	reviewIntervalSeconds: 60,
	scopeShapeIDs: [],
}, 1_000)

describe('Lock In completion', () => {
	it('ends only from a complete review verdict', () => {
		expect(createLockInCompletion(session, {
			coach: 'You reached the finish line.',
			evidence: 'The proof includes the base case and complete induction step.',
			headline: 'Proof complete',
			reviewedAt: '2026-07-23T18:00:00.000Z',
			status: 'complete',
		})).toEqual({
			coach: 'You reached the finish line.',
			completedAt: '2026-07-23T18:00:00.000Z',
			evidence: 'The proof includes the base case and complete induction step.',
			finishLine: 'A complete proof with a checked base case',
			goal: 'Finish the induction proof',
			headline: 'Proof complete',
		})
	})

	it('keeps the session active for every non-complete review', () => {
		expect(createLockInCompletion(session, {
			coach: 'Write the induction step next.',
			evidence: 'Only the base case is visible.',
			headline: 'Keep going',
			reviewedAt: '2026-07-23T18:00:00.000Z',
			status: 'on-track',
		})).toBeNull()
	})
})
