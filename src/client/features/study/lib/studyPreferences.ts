import {
	DEFAULT_STUDY_MODEL_MODE,
	DEFAULT_STUDY_REASONING_EFFORT,
	type StudyMode,
	type StudyModelMode,
	type StudyReasoningEffort,
} from '@agentboard/shared'
import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'

const STUDY_MODEL_STORAGE_KEY = 'agentboard.study-model'
const STUDY_MODE_STORAGE_KEY = 'agentboard.study-mode'
const STUDY_REASONING_EFFORT_STORAGE_KEY = 'agentboard.study-reasoning-effort'

export function readStudyModelMode(): StudyModelMode {
	const stored = getLocalStorageItem(STUDY_MODEL_STORAGE_KEY)
	return stored === 'quicker' || stored === 'smarter'
		? stored
		: DEFAULT_STUDY_MODEL_MODE
}

export function writeStudyModelMode(mode: StudyModelMode) {
	setLocalStorageItem(STUDY_MODEL_STORAGE_KEY, mode)
}

export function readStudyReasoningEffort(): StudyReasoningEffort {
	const stored = getLocalStorageItem(STUDY_REASONING_EFFORT_STORAGE_KEY)
	return stored === 'low' || stored === 'medium' || stored === 'high'
		? stored
		: DEFAULT_STUDY_REASONING_EFFORT
}

export function writeStudyReasoningEffort(effort: StudyReasoningEffort) {
	setLocalStorageItem(STUDY_REASONING_EFFORT_STORAGE_KEY, effort)
}

export function readStudyMode(): StudyMode {
	return getLocalStorageItem(STUDY_MODE_STORAGE_KEY) === 'socratic' ? 'socratic' : 'direct'
}

export function writeStudyMode(mode: StudyMode) {
	setLocalStorageItem(STUDY_MODE_STORAGE_KEY, mode)
}
