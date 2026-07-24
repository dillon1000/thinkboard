import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'

const SPOTIFY_STATUS_STORAGE_KEY = 'agentboard.spotify-status'
export const SPOTIFY_STATUS_VISIBILITY_EVENT = 'agentboard:spotify-status-visibility'

export function readSpotifyStatusVisibility() {
	return getLocalStorageItem(SPOTIFY_STATUS_STORAGE_KEY) !== 'hidden'
}

export function writeSpotifyStatusVisibility(isVisible: boolean) {
	setLocalStorageItem(SPOTIFY_STATUS_STORAGE_KEY, isVisible ? 'visible' : 'hidden')
	window.dispatchEvent(new Event(SPOTIFY_STATUS_VISIBILITY_EVENT))
}
