import { useSyncExternalStore } from 'react'

/** Subscribes to browser connectivity changes and returns the current network status. */
export function useOnlineStatus() {
	return useSyncExternalStore(
		(onStoreChange) => {
			window.addEventListener('online', onStoreChange)
			window.addEventListener('offline', onStoreChange)
			return () => {
				window.removeEventListener('online', onStoreChange)
				window.removeEventListener('offline', onStoreChange)
			}
		},
		() => navigator.onLine,
		() => true
	)
}
