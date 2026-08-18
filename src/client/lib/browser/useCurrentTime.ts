import { useMemo, useSyncExternalStore } from 'react'

/**
 * Subscribes to the wall clock at the requested interval.
 * A disabled clock keeps its last snapshot and does not create an interval.
 */
export function useCurrentTime(intervalMS: number, enabled = true) {
	const clock = useMemo(() => {
		let snapshot = Date.now()
		return {
			getSnapshot: () => snapshot,
			subscribe: (onStoreChange: () => void) => {
				if (!enabled) return () => undefined
				const interval = window.setInterval(() => {
					snapshot = Date.now()
					onStoreChange()
				}, intervalMS)
				return () => window.clearInterval(interval)
			},
		}
	}, [enabled, intervalMS])

	return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot)
}
