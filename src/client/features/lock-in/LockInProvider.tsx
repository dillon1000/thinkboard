import {
	apiRoutes,
	lockInReviewResponseSchema,
	type LockInReviewResponse,
} from '@agentboard/shared'
import { usePostHog } from '@posthog/react'
import {
	useCallback,
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { isShapeId, useValue, type Editor, type TLShapeId } from 'tldraw'
import { apiRequest } from '../../lib/api'
import { captureLockInReviewImages } from './lib/lockInCapture'
import {
	createLockInCompletion,
	type LockInCompletion,
} from './lib/lockInCompletion'
import {
	createLockInSession,
	getLockInElapsedMS,
	getLockInRemainingMS,
	pauseLockInSession,
	readLockInSession,
	resumeLockInSession,
	type LockInConfig,
	type LockInSession,
	writeLockInSession,
} from './lib/lockInSession'

export type LockInReviewState = 'idle' | 'capturing' | 'reviewing' | 'error'

interface LockInContextValue {
	closeSetup: () => void
	completion: LockInCompletion | null
	currentSelectionIDs: TLShapeId[]
	dismissCompletion: () => void
	editor: Editor | null
	endSession: () => void
	isSetupOpen: boolean
	now: number
	nextReviewAt: number | null
	openSetup: () => void
	pauseSession: () => void
	requestReview: () => Promise<void>
	review: LockInReviewResponse | null
	reviewError: string | null
	reviewState: LockInReviewState
	resumeSession: () => void
	session: LockInSession | null
	startSession: (config: LockInConfig) => void
	updateSession: (config: LockInConfig) => void
}

const LockInContext = createContext<LockInContextValue | null>(null)
const EMPTY_SHAPE_IDS: TLShapeId[] = []

interface LockInProviderProps {
	boardID: string
	children: ReactNode
	editor: Editor | null
}

export function LockInProvider({ boardID, children, editor }: LockInProviderProps) {
	const posthog = usePostHog()
	const [session, setSession] = useState<LockInSession | null>(() => readLockInSession(boardID))
	const [isSetupOpen, setIsSetupOpen] = useState(false)
	const currentSelectionIDs = useValue(
		'lock in selection IDs',
		() => editor?.getSelectedShapeIds() ?? EMPTY_SHAPE_IDS,
		[editor]
	)
	const [now, setNow] = useState(Date.now())
	const [nextReviewAt, setNextReviewAt] = useState<number | null>(null)
	const [review, setReview] = useState<LockInReviewResponse | null>(null)
	const [reviewError, setReviewError] = useState<string | null>(null)
	const [reviewState, setReviewState] = useState<LockInReviewState>('idle')
	const [completion, setCompletion] = useState<LockInCompletion | null>(null)
	const changedShapeIDsRef = useRef(new Set<TLShapeId>())
	const reviewPendingRef = useRef(false)
	const sessionRef = useRef(session)
	sessionRef.current = session

	useEffect(() => {
		writeLockInSession(boardID, session)
	}, [boardID, session])

	useEffect(() => {
		if (!editor) return
		return editor.store.listen((entry) => {
			for (const record of Object.values(entry.changes.added)) {
				if (record.typeName === 'shape' && isShapeId(record.id)) changedShapeIDsRef.current.add(record.id)
			}
			for (const [, record] of Object.values(entry.changes.updated)) {
				if (record.typeName === 'shape' && isShapeId(record.id)) changedShapeIDsRef.current.add(record.id)
			}
			for (const record of Object.values(entry.changes.removed)) {
				if (record.typeName === 'shape' && isShapeId(record.id)) changedShapeIDsRef.current.add(record.id)
			}
		}, { scope: 'document', source: 'user' })
	}, [editor])

	useEffect(() => {
		if (!session?.runningSince) return
		const tick = () => {
			const nextNow = Date.now()
			setNow(nextNow)
			if (getLockInRemainingMS(session, nextNow) === 0) {
				setSession((current) => current ? pauseLockInSession(current, nextNow) : current)
			}
		}
		tick()
		const interval = window.setInterval(tick, 1_000)
		return () => window.clearInterval(interval)
	}, [session])

	const requestReview = useCallback(async () => {
		const activeSession = sessionRef.current
		if (!editor || !activeSession || activeSession.runningSince === null || reviewPendingRef.current) {
			return
		}

		const changedShapeIDs = [...changedShapeIDsRef.current]
		for (const shapeID of changedShapeIDs) changedShapeIDsRef.current.delete(shapeID)
		reviewPendingRef.current = true
		setReviewError(null)
		setReviewState('capturing')
		try {
			const capture = await captureLockInReviewImages(editor, changedShapeIDs)
			if (sessionRef.current?.id !== activeSession.id) return
			setReviewState('reviewing')
			const nextReview = await apiRequest(
				apiRoutes.boardLockInReview(boardID),
				{
					body: JSON.stringify({
						...capture,
						elapsedMinutes: getLockInElapsedMS(activeSession) / 60_000,
						finishLine: activeSession.finishLine,
						goal: activeSession.goal,
						intervalSeconds: activeSession.reviewIntervalSeconds,
						sessionID: activeSession.id,
					}),
					method: 'POST',
				},
				lockInReviewResponseSchema
			)
			const currentSession = sessionRef.current
			if (!currentSession || currentSession.id !== activeSession.id) return
			setReview(nextReview)
			setReviewState('idle')
			const completedSession = createLockInCompletion(currentSession, nextReview)
			if (completedSession) {
				posthog?.capture('lock_in_session_completed', {
					duration_minutes: currentSession.durationMinutes,
					elapsed_ms: getLockInElapsedMS(currentSession),
				})
				setCompletion(completedSession)
				setSession(null)
				setIsSetupOpen(false)
				setNextReviewAt(null)
				changedShapeIDsRef.current.clear()
				return
			}
			if (nextReview.status === 'drifting' && currentSession.redirectWhenDrifting) {
				redirectToFocus(editor, currentSession.scopeShapeIDs)
			}
		} catch (error) {
			for (const shapeID of changedShapeIDs) changedShapeIDsRef.current.add(shapeID)
			setReviewError(error instanceof Error ? error.message : 'Focus coach could not review the canvas')
			setReviewState('error')
		} finally {
			reviewPendingRef.current = false
		}
	}, [boardID, editor])

	useEffect(() => {
		if (!session?.runningSince) {
			setNextReviewAt(null)
			return
		}
		const intervalMS = session.reviewIntervalSeconds * 1_000
		let cancelled = false
		let timeoutID: number | undefined
		const schedule = () => {
			setNextReviewAt(Date.now() + intervalMS)
			timeoutID = window.setTimeout(() => {
				void requestReview().finally(() => {
					if (!cancelled) schedule()
				})
			}, intervalMS)
		}
		schedule()
		return () => {
			cancelled = true
			if (timeoutID !== undefined) window.clearTimeout(timeoutID)
		}
	}, [requestReview, session?.id, session?.reviewIntervalSeconds, session?.runningSince])

	const value = useMemo<LockInContextValue>(() => ({
		closeSetup: () => setIsSetupOpen(false),
		completion,
		currentSelectionIDs,
		dismissCompletion: () => setCompletion(null),
		editor,
		endSession: () => {
			posthog?.capture('lock_in_session_ended', {
				duration_minutes: sessionRef.current?.durationMinutes,
				elapsed_ms: sessionRef.current ? getLockInElapsedMS(sessionRef.current) : undefined,
			})
			setSession(null)
			setIsSetupOpen(false)
			setReview(null)
			setReviewError(null)
			setReviewState('idle')
			setNextReviewAt(null)
			changedShapeIDsRef.current.clear()
		},
		isSetupOpen,
		now,
		nextReviewAt,
		openSetup: () => setIsSetupOpen(true),
		pauseSession: () => setSession((current) => current ? pauseLockInSession(current) : current),
		requestReview,
		review,
		reviewError,
		reviewState,
		resumeSession: () => setSession((current) => current ? resumeLockInSession(current) : current),
		session,
		startSession: (config) => {
			posthog?.capture('lock_in_session_started', {
				duration_minutes: config.durationMinutes,
				redirect_when_drifting: config.redirectWhenDrifting,
				playlist_enabled: config.playlistEnabled,
				has_scope: config.scopeShapeIDs.length > 0,
			})
			setSession(createLockInSession(config))
			setCompletion(null)
			setReview(null)
			setReviewError(null)
			setReviewState('idle')
			changedShapeIDsRef.current.clear()
			setIsSetupOpen(false)
			editor?.selectNone()
		},
		updateSession: (config) => {
			setSession((current) => current ? { ...current, ...config } : createLockInSession(config))
			setIsSetupOpen(false)
			editor?.selectNone()
		},
	}), [
		currentSelectionIDs,
		completion,
		editor,
		isSetupOpen,
		nextReviewAt,
		now,
		posthog,
		requestReview,
		review,
		reviewError,
		reviewState,
		session,
	])

	return <LockInContext.Provider value={value}>{children}</LockInContext.Provider>
}

function redirectToFocus(editor: Editor, shapeIDs: readonly TLShapeId[]) {
	const bounds = shapeIDs.flatMap((shapeID) => {
		const value = editor.getShapePageBounds(shapeID)
		return value ? [value] : []
	})
	editor.selectNone()
	if (bounds.length === 0) {
		editor.zoomToFit({ animation: { duration: 500 } })
		return
	}
	const minX = Math.min(...bounds.map(({ minX }) => minX))
	const minY = Math.min(...bounds.map(({ minY }) => minY))
	const maxX = Math.max(...bounds.map(({ maxX }) => maxX))
	const maxY = Math.max(...bounds.map(({ maxY }) => maxY))
	editor.zoomToBounds(
		{ h: maxY - minY, w: maxX - minX, x: minX, y: minY },
		{ animation: { duration: 500 }, inset: 96 }
	)
}

export function useLockIn() {
	const context = useContext(LockInContext)
	if (!context) throw new Error('useLockIn must be used inside LockInProvider')
	return context
}
