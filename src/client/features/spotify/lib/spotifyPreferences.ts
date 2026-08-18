import { useSyncExternalStore } from 'react'
import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'

const SPOTIFY_STATUS_STORAGE_KEY = 'agentboard.spotify-status'
export const SPOTIFY_STATUS_VISIBILITY_EVENT = 'agentboard:spotify-status-visibility'

export function readSpotifyStatusVisibility() {
	return getLocalStorageItem(SPOTIFY_STATUS_STORAGE_KEY) !== 'hidden'
}

/** Subscribes to Spotify status visibility changes from this tab and other tabs. */
export function useSpotifyStatusVisibility() {
	return useSyncExternalStore(
		(onStoreChange) => {
			window.addEventListener('storage', onStoreChange)
			window.addEventListener(SPOTIFY_STATUS_VISIBILITY_EVENT, onStoreChange)
			return () => {
				window.removeEventListener('storage', onStoreChange)
				window.removeEventListener(SPOTIFY_STATUS_VISIBILITY_EVENT, onStoreChange)
			}
		},
		readSpotifyStatusVisibility,
		() => true
	)
}

export function writeSpotifyStatusVisibility(isVisible: boolean) {
	setLocalStorageItem(SPOTIFY_STATUS_STORAGE_KEY, isVisible ? 'visible' : 'hidden')
	window.dispatchEvent(new Event(SPOTIFY_STATUS_VISIBILITY_EVENT))
}
