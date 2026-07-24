import { DEFAULT_STUDY_MODEL_MODE, type StudyMode, type StudyModelMode } from '@agentboard/shared'
import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'

const STUDY_MODEL_STORAGE_KEY = 'agentboard.study-model'
const STUDY_MODE_STORAGE_KEY = 'agentboard.study-mode'

export function readStudyModelMode(): StudyModelMode {
	const stored = getLocalStorageItem(STUDY_MODEL_STORAGE_KEY)
	return stored === 'quicker' || stored === 'smarter'
		? stored
		: DEFAULT_STUDY_MODEL_MODE
}

export function writeStudyModelMode(mode: StudyModelMode) {
	setLocalStorageItem(STUDY_MODEL_STORAGE_KEY, mode)
}

export function readStudyMode(): StudyMode {
	return getLocalStorageItem(STUDY_MODE_STORAGE_KEY) === 'socratic' ? 'socratic' : 'direct'
}

export function writeStudyMode(mode: StudyMode) {
	setLocalStorageItem(STUDY_MODE_STORAGE_KEY, mode)
}
