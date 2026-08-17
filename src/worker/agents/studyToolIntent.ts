export type StudyToolName =
	| 'addReviewNote'
	| 'createConceptMap'
	| 'createFlashcards'
	| 'createPracticeSet'
	| 'createQuiz'
	| 'createStudyPack'
	| 'createWalkthrough'
	| 'composeCanvas'
	| 'recordMistake'
	| 'saveMemory'
	| 'writeEquation'

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
		.flatMap((part) => part.type === 'text' && part.text ? [part.text] : [])
			.join('\n')

	if (/\b(?:make|create|generate|build)\b[\s\S]{0,100}\b(?:cited\s+)?study\s+pack\b/i.test(text)) {
		return 'createStudyPack'
	}
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
	if (/\b(?:write|put|place|show|add|derive)\b[\s\S]{0,80}\b(?:equations?|formulas?|derivations?|identity)\b/i.test(text)) {
		return 'writeEquation'
	}
	if (/\b(?:remember|save|record|track)\b[\s\S]{0,120}\b(?:about me|background|fact|goal|memory|mistake|preference|that|this)\b/i.test(text)) {
		return 'saveMemory'
	}
	if (/\b(?:add|create|make|leave|put|place|write|propose)\b[\s\S]{0,80}\b(?:(?:review|correction|feedback)\s+note|correction)\b/i.test(text)) {
		return 'addReviewNote'
	}
	if (
		!/\bcraft\b/i.test(text) &&
		/\b(?:add|arrange|build|change|color|connect|create|delete|diagram|draw|flowchart|frame|group|label|lay\s*out|make|move|place|remove|resize|restyle|shape|style)\b[\s\S]{0,120}\b(?:arrows?|board|boxes?|canvas|circles?|connectors?|diagram|ellipses?|frames?|groups?|lines?|map|notes?|rectangles?|shapes?|text)\b/i.test(text)
	) {
		return 'composeCanvas'
	}
	return undefined
}
