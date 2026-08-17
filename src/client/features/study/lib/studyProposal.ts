import {
	agentMemoryProposalSchema,
	conceptMapProposalSchema,
	canvasPlanInputSchema,
	canvasPlanSchema,
	normalizeCanvasPlanInput,
	equationProposalSchema,
	flashcardProposalSchema,
	mistakeProposalSchema,
	practiceSetProposalSchema,
	studyPackProposalSchema,
	quizProposalSchema,
	reviewProposalSchema,
	walkthroughProposalSchema,
} from '@agentboard/shared'

export type SupportedProposalName =
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

export interface LeakedProposal {
	input: unknown
	toolName: SupportedProposalName
}

export function hasProviderToolCallEnvelope(text: string) {
	return text.includes('<|tool_calls_section_begin|>') ||
		text.includes('<|tool_call_begin|>')
}

const proposalNames: readonly SupportedProposalName[] = [
	'addReviewNote',
	'createFlashcards',
	'createQuiz',
	'createWalkthrough',
	'createConceptMap',
	'createPracticeSet',
	'createStudyPack',
	'composeCanvas',
	'writeEquation',
	'recordMistake',
	'saveMemory',
]

export function parseLeakedProposal(text: string): LeakedProposal | null {
	for (const value of [...parseProviderToolCalls(text), ...parseJSONValues(text)]) {
		const proposal = parseProposalValue(value)
		if (proposal) return proposal
	}
	return null
}

function parseProposalValue(value: unknown): LeakedProposal | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const proposal = parseProposalValue(item)
			if (proposal) return proposal
		}
		return null
	}
	if (!isRecord(value)) return null

	const functionCall = isRecord(value.function) ? value.function : undefined
	const toolName = value.name ?? value.toolName ?? functionCall?.name
	if (!isSupportedProposalName(toolName)) return null

	const wrappedInput = value.parameters ?? value.arguments ?? value.input ?? functionCall?.arguments
	const input = wrappedInput === undefined ? getFlatInput(value) : parsePossiblyEncodedJSON(wrappedInput)
	if (toolName === 'addReviewNote' && reviewProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'createFlashcards' && flashcardProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'createQuiz' && quizProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'createWalkthrough' && walkthroughProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'createConceptMap' && conceptMapProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'createPracticeSet' && practiceSetProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'createStudyPack' && studyPackProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'writeEquation' && equationProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'recordMistake' && mistakeProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'saveMemory' && agentMemoryProposalSchema.safeParse(input).success) {
		return { input, toolName }
	}
	if (toolName === 'composeCanvas') {
		if (canvasPlanSchema.safeParse(input).success) return { input, toolName }
		const result = canvasPlanInputSchema.safeParse(input)
		if (result.success) return { input: normalizeCanvasPlanInput(result.data), toolName }
	}
	return null
}

function parseProviderToolCalls(text: string) {
	const values: unknown[] = []
	const pattern = /<\|tool_call_begin\|>(?:functions\.)?([A-Za-z][A-Za-z0-9_]*)(?::\d+)?<\|tool_call_argument_begin\|>([\s\S]*?)<\|tool_call_end\|>/g
	for (const match of text.matchAll(pattern)) {
		const [, name, encodedInput] = match
		if (!name || !encodedInput) continue
		try {
			values.push({ name, input: JSON.parse(encodedInput) as unknown })
		} catch {
			// Another provider envelope in the same response may still contain valid JSON.
		}
	}
	return values
}

function parseJSONValues(text: string) {
	const values: unknown[] = []
	for (let start = 0; start < text.length; start += 1) {
		const opening = text[start]
		if (opening !== '{' && opening !== '[') continue
		const end = findJSONEnd(text, start)
		if (end === -1) continue
		try {
			values.push(JSON.parse(text.slice(start, end + 1)) as unknown)
			start = end
		} catch {
			// A later opening delimiter may still begin a valid tool call.
		}
	}
	return values
}

function findJSONEnd(text: string, start: number) {
	const delimiters: string[] = []
	let inString = false
	let escaped = false

	for (let index = start; index < text.length; index += 1) {
		const character = text[index]
		if (inString) {
			if (escaped) {
				escaped = false
			} else if (character === '\\') {
				escaped = true
			} else if (character === '"') {
				inString = false
			}
			continue
		}

		if (character === '"') {
			inString = true
			continue
		}
		if (character === '{' || character === '[') {
			delimiters.push(character)
			continue
		}
		if (character !== '}' && character !== ']') continue

		const opening = delimiters.pop()
		if ((opening === '{' && character !== '}') || (opening === '[' && character !== ']')) {
			return -1
		}
		if (delimiters.length === 0) return index
	}
	return -1
}

function getFlatInput(value: Record<string, unknown>) {
	const input: Record<string, unknown> = {}
	for (const [key, fieldValue] of Object.entries(value)) {
		if (key !== 'name' && key !== 'toolName' && key !== 'function' && key !== 'type') {
			input[key] = fieldValue
		}
	}
	return input
}

function parsePossiblyEncodedJSON(value: unknown) {
	if (typeof value !== 'string') return value
	try {
		return JSON.parse(value) as unknown
	} catch {
		return value
	}
}

function isSupportedProposalName(value: unknown): value is SupportedProposalName {
	return typeof value === 'string' && proposalNames.some((toolName) => toolName === value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
