import type { AIRunner } from '../routes/lockIn'
import { z } from 'zod'

export const DEFAULT_CONVERSATION_TITLE_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'

const MAX_TITLE_LENGTH = 60
const MAX_SOURCE_LENGTH = 600

const TITLE_SYSTEM_PROMPT =
	'You name study-chat conversations. Given the student’s opening message, reply with a short, specific title of 3 to 6 words in Title Case. Name the topic, not the request: prefer "Chain Rule Practice" over "Help With Calculus". No quotation marks, no trailing punctuation, no emoji, no prefixes like "Title:". Reply with the title only.'
const generatedTextSchema = z.object({
	response: z.string().optional(),
	result: z.string().optional(),
	text: z.string().optional(),
})

/**
 * A concise, human-readable conversation title from the opening message, via Llama 4. The model
 * is asked for a topic label rather than an echo of the request, which reads better in history
 * than the first 50 characters of whatever the student typed.
 */
export async function generateConversationTitle<Options>(
	ai: AIRunner,
	model: string,
	firstMessage: string,
	options?: Options
): Promise<string | null> {
	const source = firstMessage.trim().replace(/\s+/g, ' ').slice(0, MAX_SOURCE_LENGTH)
	if (!source) return null

	const response = await ai.run(
		model,
		{
			max_tokens: 24,
			messages: [
				{ content: TITLE_SYSTEM_PROMPT, role: 'system' },
				{ content: source, role: 'user' },
			],
			temperature: 0.2,
		},
		options
	)

	return cleanTitle(readGeneratedText(response))
}

/** Strips the wrappers models reach for even when told not to, then bounds the length. */
export function cleanTitle(raw: string): string | null {
	let title = raw.trim()
	if (!title) return null
	title = title.replace(/^title\s*[:\-—]\s*/i, '')
	title = title.replace(/^["'“‘]+|["'”’]+$/g, '')
	title = title.replace(/[.\s]+$/, '')
	title = title.replace(/\s+/g, ' ').trim()
	if (!title) return null
	if (title.length > MAX_TITLE_LENGTH) {
		title = `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
	}
	return title
}

function readGeneratedText<Value>(value: Value): string {
	const parsed = generatedTextSchema.safeParse(value)
	return parsed.success
		? parsed.data.response ?? parsed.data.result ?? parsed.data.text ?? ''
		: ''
}
