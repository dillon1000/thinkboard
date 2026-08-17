import {
	DEFAULT_LOCK_IN_REVIEW_INTERVAL_SECONDS,
	LOCK_IN_REVIEW_INTERVAL_OPTIONS,
} from '@agentboard/shared'
import { isShapeId, type TLShapeId } from 'tldraw'
import { z } from 'zod'

export const LOCK_IN_DURATION_OPTIONS = [25, 45, 60, 90] as const
export { LOCK_IN_REVIEW_INTERVAL_OPTIONS }

const storedLockInSessionSchema = z.object({
	durationMinutes: z.number(),
	elapsedMS: z.number(),
	finishLine: z.string(),
	goal: z.string(),
	id: z.string(),
	playlistEnabled: z.boolean().default(false),
	redirectWhenDrifting: z.boolean().default(true),
	reviewIntervalSeconds: z.number().optional(),
	runningSince: z.number().nullable(),
	scopeShapeIDs: z.array(z.custom<TLShapeId>((value) => {
		const parsed = z.string().safeParse(value)
		return parsed.success && isShapeId(parsed.data)
	})),
})

export interface LockInConfig {
	durationMinutes: number
	finishLine: string
	goal: string
	playlistEnabled: boolean
	redirectWhenDrifting: boolean
	reviewIntervalSeconds: number
	scopeShapeIDs: TLShapeId[]
}

export interface LockInSession extends LockInConfig {
	elapsedMS: number
	id: string
	runningSince: number | null
}

export function createLockInSession(config: LockInConfig, now = Date.now()): LockInSession {
	return {
		...config,
		elapsedMS: 0,
		id: crypto.randomUUID(),
		runningSince: now,
	}
}

export function getLockInElapsedMS(session: LockInSession, now = Date.now()) {
	const liveElapsedMS = session.runningSince === null ? 0 : Math.max(0, now - session.runningSince)
	return Math.min(session.durationMinutes * 60_000, session.elapsedMS + liveElapsedMS)
}

export function getLockInRemainingMS(session: LockInSession, now = Date.now()) {
	return Math.max(0, session.durationMinutes * 60_000 - getLockInElapsedMS(session, now))
}

export function pauseLockInSession(session: LockInSession, now = Date.now()): LockInSession {
	if (session.runningSince === null) return session
	return {
		...session,
		elapsedMS: getLockInElapsedMS(session, now),
		runningSince: null,
	}
}

export function resumeLockInSession(session: LockInSession, now = Date.now()): LockInSession {
	if (session.runningSince !== null || getLockInRemainingMS(session, now) === 0) return session
	return { ...session, runningSince: now }
}

export function formatLockInTime(remainingMS: number) {
	const totalSeconds = Math.max(0, Math.ceil(remainingMS / 1_000))
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function readLockInSession(boardID: string): LockInSession | null {
	try {
		const value = window.sessionStorage.getItem(lockInStorageKey(boardID))
		if (!value) return null
		const parsed = storedLockInSessionSchema.safeParse(JSON.parse(value))
		if (!parsed.success) return null
		const session = parsed.data
		return {
			durationMinutes: session.durationMinutes,
			elapsedMS: session.elapsedMS,
			finishLine: session.finishLine,
			goal: session.goal,
			id: session.id,
			playlistEnabled: session.playlistEnabled === true,
			redirectWhenDrifting: session.redirectWhenDrifting !== false,
			reviewIntervalSeconds: session.reviewIntervalSeconds !== undefined
				&& LOCK_IN_REVIEW_INTERVAL_OPTIONS.some((value) => value === session.reviewIntervalSeconds)
				? session.reviewIntervalSeconds
				: DEFAULT_LOCK_IN_REVIEW_INTERVAL_SECONDS,
			runningSince: session.runningSince,
			scopeShapeIDs: session.scopeShapeIDs,
		}
	} catch {
		return null
	}
}

export function writeLockInSession(boardID: string, session: LockInSession | null) {
	try {
		const key = lockInStorageKey(boardID)
		if (session) window.sessionStorage.setItem(key, JSON.stringify(session))
		else window.sessionStorage.removeItem(key)
	} catch {
		// The session remains available for the current page when browser storage is unavailable.
	}
}

function lockInStorageKey(boardID: string) {
	return `agentboard.lock-in.${boardID}`
}
