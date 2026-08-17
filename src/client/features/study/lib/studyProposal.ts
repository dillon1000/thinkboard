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
	| z.input<typeof agentMemoryProposalSchema>
	| z.input<typeof conceptMapProposalSchema>
	| z.input<typeof canvasPlanSchema>
	| z.input<typeof equationProposalSchema>
	| z.input<typeof flashcardProposalSchema>
	| z.input<typeof mistakeProposalSchema>
	| z.input<typeof practiceSetProposalSchema>
	| z.input<typeof studyPackProposalSchema>
	| z.input<typeof quizProposalSchema>
	| z.input<typeof reviewProposalSchema>
	| z.input<typeof walkthroughProposalSchema>

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
	const toolName = value.name ?? value.toolName ?? functionCall?.name
	if (!isSupportedProposalName(toolName)) return null

	const wrappedInput = value.parameters ?? value.arguments ?? value.input ?? functionCall?.arguments
	const input = wrappedInput === undefined ? getFlatInput(value) : parsePossiblyEncodedJSON(wrappedInput)
	if (toolName === 'addReviewNote') {
		const validated = preserveValidatedInput(reviewProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'createFlashcards') {
		const validated = preserveValidatedInput(flashcardProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'createQuiz') {
		const validated = preserveValidatedInput(quizProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'createWalkthrough') {
		const validated = preserveValidatedInput(walkthroughProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'createConceptMap') {
		const validated = preserveValidatedInput(conceptMapProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'createPracticeSet') {
		const validated = preserveValidatedInput(practiceSetProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'createStudyPack') {
		const validated = preserveValidatedInput(studyPackProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'writeEquation') {
		const validated = preserveValidatedInput(equationProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'recordMistake') {
		const validated = preserveValidatedInput(mistakeProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'saveMemory') {
		const validated = preserveValidatedInput(agentMemoryProposalSchema, input)
		if (validated) return { input: validated, toolName }
	}
	if (toolName === 'composeCanvas') {
		const plan = preserveValidatedInput(canvasPlanSchema, input)
		if (plan) return { input: plan, toolName }
		const result = canvasPlanInputSchema.safeParse(input)
		if (result.success) return { input: normalizeCanvasPlanInput(result.data), toolName }
	}
	return null
}

function preserveValidatedInput<Schema extends z.ZodType>(
	schema: Schema,
	value: z.output<typeof JSONValueSchema>
): z.input<Schema> | null {
	if (!schema.safeParse(value).success) return null
	// SAFETY: This returns the original JSON only after the owning proposal schema accepts it.
	return value as z.input<Schema>
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

function isSupportedProposalName<Value>(value: Value): value is Value & SupportedProposalName {
	return supportedProposalNameSchema.safeParse(value).success
}

function isRecord<Value>(value: Value): value is Value & z.output<typeof JSONRecordSchema> {
	return JSONRecordSchema.safeParse(value).success
}
