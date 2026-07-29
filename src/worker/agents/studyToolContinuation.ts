export type StudyToolContinuation = 'applied' | 'dismissed' | 'error' | 'saved'

interface ChatMessageLike {
	parts: ReadonlyArray<{ state?: string; type: string; output?: unknown }>
	role: string
}

const STUDY_TOOL_TYPES = new Set([
	'tool-addReviewNote',
	'tool-createFlashcards',
	'tool-createQuiz',
	'tool-createWalkthrough',
	'tool-createConceptMap',
	'tool-createPracticeSet',
	'tool-createStudyPack',
	'tool-composeCanvas',
	'tool-recordMistake',
	'tool-saveMemory',
	'tool-writeEquation',
])

export function getStudyToolContinuation(
	messages: readonly ChatMessageLike[]
): StudyToolContinuation | undefined {
	const latestMessage = messages.at(-1)
	if (latestMessage?.role !== 'assistant') return undefined

	const toolPart = latestMessage.parts.findLast(
		(part) => STUDY_TOOL_TYPES.has(part.type) &&
			(part.state === 'output-available' || part.state === 'output-error')
	)
	if (!toolPart) return undefined
	if (toolPart.state === 'output-error') return 'error'

	const applied = toolPart.output &&
		typeof toolPart.output === 'object' &&
		Reflect.get(toolPart.output, 'applied') === true
	if (!applied) return 'dismissed'
	return toolPart.type === 'tool-saveMemory' || toolPart.type === 'tool-recordMistake'
		? 'saved'
		: 'applied'
}

export function getStudyToolContinuationInstruction(
	continuation: StudyToolContinuation | undefined
): string {
	if (!continuation) return ''

	const result = continuation === 'applied'
		? 'The browser reports that the student added the proposal to the board.'
		: continuation === 'saved'
			? 'The browser reports that the student approved and saved the memory.'
		: continuation === 'dismissed'
			? 'The browser reports that the student dismissed the proposal.'
			: 'The browser reports that it could not add the proposal.'

	return `\n- ${result} This is an automatic tool-result continuation, so there is no missing or empty user message. Acknowledge the result in one brief sentence. Do not ask the student to restate the request, upload notes, or create another artifact.`
}
