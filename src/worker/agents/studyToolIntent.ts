export type StudyToolName =
	| 'addReviewNote'
	| 'createConceptMap'
	| 'createFlashcards'
	| 'createPracticeSet'
	| 'createQuiz'
	| 'createWalkthrough'
	| 'recordMistake'

interface ChatMessageLike {
	parts: ReadonlyArray<{ type: string; text?: string }>
	role: string
}

export function getRequestedStudyTool(
	messages: readonly ChatMessageLike[]
): StudyToolName | undefined {
	const latestMessage = messages.at(-1)
	if (latestMessage?.role !== 'user') return undefined
	const text = latestMessage.parts
		.filter((part) => part.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text)
		.join('\n')

	if (/\b(?:make|create|generate|turn|convert|build)\b[\s\S]{0,80}\bflashcards?\b/i.test(text)) {
		return 'createFlashcards'
	}
	if (/\b(?:make|create|generate|give)\b[\s\S]{0,100}\b(?:more|similar|practice)\b[\s\S]{0,80}\b(?:problems?|questions?|examples?)\b/i.test(text)) {
		return 'createPracticeSet'
	}
	if (/\b(?:make|create|generate|turn|build)\b[\s\S]{0,80}\bquiz(?:zes)?\b/i.test(text)) {
		return 'createQuiz'
	}
	if (/\b(?:make|create|generate|summarize|turn)\b[\s\S]{0,100}\bconcept\s+map\b/i.test(text)) {
		return 'createConceptMap'
	}
	if (/\b(?:make|create|show|build)\b[\s\S]{0,100}\b(?:worked\s+example|walkthrough|step[- ]by[- ]step)\b/i.test(text)) {
		return 'createWalkthrough'
	}
	if (/\b(?:save|record|remember|track)\b[\s\S]{0,80}\b(?:mistake|error)\b/i.test(text)) {
		return 'recordMistake'
	}
	if (/\b(?:add|create|make|leave|put|place|write|propose)\b[\s\S]{0,80}\b(?:(?:review|correction|feedback)\s+note|correction)\b/i.test(text)) {
		return 'addReviewNote'
	}
	return undefined
}
