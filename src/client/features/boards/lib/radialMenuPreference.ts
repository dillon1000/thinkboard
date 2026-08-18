import { useSyncExternalStore } from 'react'
import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'

const RADIAL_MENU_STORAGE_KEY = 'agentboard.radial-menu'
export const RADIAL_MENU_PREFERENCE_EVENT = 'agentboard:radial-menu-preference'

/** Off by default: outside Zen the press-and-hold menu only appears once the user opts in. */
export function readRadialMenuAlwaysOn() {
	return getLocalStorageItem(RADIAL_MENU_STORAGE_KEY) === 'on'
}

/** Subscribes to radial-menu preference changes from this tab and other tabs. */
export function useRadialMenuAlwaysOn() {
	return useSyncExternalStore(
		(onStoreChange) => {
			window.addEventListener('storage', onStoreChange)
			window.addEventListener(RADIAL_MENU_PREFERENCE_EVENT, onStoreChange)
			return () => {
				window.removeEventListener('storage', onStoreChange)
				window.removeEventListener(RADIAL_MENU_PREFERENCE_EVENT, onStoreChange)
			}
		},
		readRadialMenuAlwaysOn,
		() => false
	)
}

export function writeRadialMenuAlwaysOn(isAlwaysOn: boolean) {
	setLocalStorageItem(RADIAL_MENU_STORAGE_KEY, isAlwaysOn ? 'on' : 'off')
	window.dispatchEvent(new Event(RADIAL_MENU_PREFERENCE_EVENT))
}
