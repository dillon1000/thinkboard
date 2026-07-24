import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	createLockInSession,
	formatLockInTime,
	getLockInElapsedMS,
	getLockInRemainingMS,
	pauseLockInSession,
	resumeLockInSession,
} from './lockInSession'

describe('lockInSession', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('tracks elapsed and remaining time across pauses', () => {
		vi.stubGlobal('crypto', { randomUUID: () => 'session-id' })
		const session = createLockInSession({
			durationMinutes: 45,
			finishLine: 'One complete answer',
			goal: 'Finish the explanation',
			playlistEnabled: false,
			redirectWhenDrifting: true,
			reviewIntervalSeconds: 60,
			scopeShapeIDs: [],
		}, 1_000)

		expect(getLockInElapsedMS(session, 61_000)).toBe(60_000)
		expect(getLockInRemainingMS(session, 61_000)).toBe(44 * 60_000)

		const paused = pauseLockInSession(session, 61_000)
		expect(getLockInElapsedMS(paused, 121_000)).toBe(60_000)

		const resumed = resumeLockInSession(paused, 121_000)
		expect(getLockInElapsedMS(resumed, 151_000)).toBe(90_000)
	})

	it('formats time without dropping a partial second', () => {
		expect(formatLockInTime(38 * 60_000 + 24_000)).toBe('38:24')
		expect(formatLockInTime(1)).toBe('0:01')
		expect(formatLockInTime(0)).toBe('0:00')
	})
})
