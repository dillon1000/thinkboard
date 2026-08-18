import { useSyncExternalStore } from 'react'

/**
 * Subscribes to a browser media query and returns its current match state.
 * The query must stay stable for the lifetime of the calling component.
 */
export function useMediaQuery(query: string) {
	return useSyncExternalStore(
		(onStoreChange) => {
			const mediaQuery = window.matchMedia(query)
			mediaQuery.addEventListener('change', onStoreChange)
			return () => mediaQuery.removeEventListener('change', onStoreChange)
		},
		() => window.matchMedia(query).matches,
		() => false
	)
}
