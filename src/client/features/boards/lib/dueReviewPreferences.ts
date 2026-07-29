import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'

const DUE_REVIEWS_STORAGE_KEY = 'agentboard.due-reviews'

/** Due reviews are visible by default until the user hides the homepage section. */
export function readDueReviewVisibility() {
	return getLocalStorageItem(DUE_REVIEWS_STORAGE_KEY) !== 'hidden'
}

/** Persists the homepage section visibility in this browser. */
export function writeDueReviewVisibility(isVisible: boolean) {
	setLocalStorageItem(DUE_REVIEWS_STORAGE_KEY, isVisible ? 'visible' : 'hidden')
}
