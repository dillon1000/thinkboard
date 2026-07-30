import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'

const BOARD_FLASHCARD_DIRECT_REVEAL_KEY = 'agentboard.board-flashcard-direct-reveal'

/** Answering stays enabled by default; this preference only changes clicks on canvas cards. */
export function readBoardFlashcardDirectReveal() {
	return getLocalStorageItem(BOARD_FLASHCARD_DIRECT_REVEAL_KEY) === 'on'
}

/** Persists whether canvas cards reveal directly instead of opening the answer dialog. */
export function writeBoardFlashcardDirectReveal(isEnabled: boolean) {
	setLocalStorageItem(BOARD_FLASHCARD_DIRECT_REVEAL_KEY, isEnabled ? 'on' : 'off')
}
