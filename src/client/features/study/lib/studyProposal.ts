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
import { z } from 'zod'

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
	input: SupportedProposalInput
	toolName: SupportedProposalName
}

type SupportedProposalInput =
	| z.output<typeof agentMemoryProposalSchema>
	| z.output<typeof conceptMapProposalSchema>
	| z.output<typeof canvasPlanSchema>
	| z.output<typeof equationProposalSchema>
	| z.output<typeof flashcardProposalSchema>
	| z.output<typeof mistakeProposalSchema>
	| z.output<typeof practiceSetProposalSchema>
	| z.output<typeof studyPackProposalSchema>
	| z.output<typeof quizProposalSchema>
	| z.output<typeof reviewProposalSchema>
	| z.output<typeof walkthroughProposalSchema>

const JSONValueSchema = z.json()
const JSONRecordSchema = z.record(z.string(), JSONValueSchema)

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
const supportedProposalNameSchema = z.enum(proposalNames)
const proposalSchemas = {
	addReviewNote: reviewProposalSchema,
	createConceptMap: conceptMapProposalSchema,
	createFlashcards: flashcardProposalSchema,
	createPracticeSet: practiceSetProposalSchema,
	createQuiz: quizProposalSchema,
	createStudyPack: studyPackProposalSchema,
	createWalkthrough: walkthroughProposalSchema,
	recordMistake: mistakeProposalSchema,
	saveMemory: agentMemoryProposalSchema,
	writeEquation: equationProposalSchema,
} satisfies Record<Exclude<SupportedProposalName, 'composeCanvas'>, z.ZodType>

export function parseLeakedProposal(text: string): LeakedProposal | null {
	for (const value of [...parseProviderToolCalls(text), ...parseJSONValues(text)]) {
		const proposal = parseProposalValue(value)
		if (proposal) return proposal
	}
	return null
}

function parseProposalValue<Value>(value: Value): LeakedProposal | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const proposal = parseProposalValue(item)
			if (proposal) return proposal
		}
		return null
	}
	if (!isRecord(value)) return null

	const functionCall = isRecord(value.function) ? value.function : undefined
	const parsedToolName = supportedProposalNameSchema.safeParse(
		value.name ?? value.toolName ?? functionCall?.name
	)
	if (!parsedToolName.success) return null
	const toolName = parsedToolName.data

	const wrappedInput = value.parameters ?? value.arguments ?? value.input ?? functionCall?.arguments
	const input = wrappedInput === undefined ? getFlatInput(value) : parsePossiblyEncodedJSON(wrappedInput)
	if (toolName === 'composeCanvas') {
		const plan = canvasPlanSchema.safeParse(input)
		if (plan.success) return { input: plan.data, toolName }
		const result = canvasPlanInputSchema.safeParse(input)
		if (result.success) return { input: normalizeCanvasPlanInput(result.data), toolName }
		return null
	}
	const result = proposalSchemas[toolName].safeParse(input)
	return result.success ? { input: result.data, toolName } : null
}

function parseProviderToolCalls(text: string) {
	const values: z.output<typeof JSONValueSchema>[] = []
	const pattern = /<\|tool_call_begin\|>(?:functions\.)?([A-Za-z][A-Za-z0-9_]*)(?::\d+)?<\|tool_call_argument_begin\|>([\s\S]*?)<\|tool_call_end\|>/g
	for (const match of text.matchAll(pattern)) {
		const [, name, encodedInput] = match
		if (!name || !encodedInput) continue
		try {
			values.push(JSONValueSchema.parse({ name, input: JSON.parse(encodedInput) }))
		} catch {
			// Another provider envelope in the same response may still contain valid JSON.
		}
	}
	return values
}

function parseJSONValues(text: string) {
	const values: z.output<typeof JSONValueSchema>[] = []
	for (let start = 0; start < text.length; start += 1) {
		const opening = text[start]
		if (opening !== '{' && opening !== '[') continue
		const end = findJSONEnd(text, start)
		if (end === -1) continue
		try {
			values.push(JSONValueSchema.parse(JSON.parse(text.slice(start, end + 1))))
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

function getFlatInput(value: z.output<typeof JSONRecordSchema>) {
	const input: z.output<typeof JSONRecordSchema> = {}
	for (const [key, fieldValue] of Object.entries(value)) {
		if (key !== 'name' && key !== 'toolName' && key !== 'function' && key !== 'type') {
			input[key] = fieldValue
		}
	}
	return input
}

function parsePossiblyEncodedJSON(value: z.output<typeof JSONValueSchema>) {
	const encoded = z.string().safeParse(value)
	if (!encoded.success) return value
	try {
		return JSONValueSchema.parse(JSON.parse(encoded.data))
	} catch {
		return value
	}
}

function isRecord<Value>(value: Value): value is Value & z.output<typeof JSONRecordSchema> {
	return JSONRecordSchema.safeParse(value).success
}
