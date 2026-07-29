import { describe, expect, it, vi } from 'vitest'
import { cleanTitle, generateConversationTitle } from './conversationTitle'
import type { AIRunner } from '../routes/lockIn'

describe('cleanTitle', () => {
	it('strips wrapping quotes, a Title: prefix, and trailing punctuation', () => {
		expect(cleanTitle('Title: "Chain Rule Practice."')).toBe('Chain Rule Practice')
		expect(cleanTitle('“Newton’s Laws”')).toBe('Newton’s Laws')
	})

	it('collapses whitespace and returns null for empty output', () => {
		expect(cleanTitle('  Wave   Interference  ')).toBe('Wave Interference')
		expect(cleanTitle('   ')).toBeNull()
	})

	it('truncates over-long titles with an ellipsis', () => {
		const title = cleanTitle('A'.repeat(80))
		expect(title).not.toBeNull()
		expect(title!.length).toBe(60)
		expect(title!.endsWith('…')).toBe(true)
	})
})

describe('generateConversationTitle', () => {
	it('sends the trimmed message to the model and cleans the response', async () => {
		const run = vi.fn().mockResolvedValue({ response: 'Photosynthesis Basics' })
		const ai: AIRunner = { run }
		const title = await generateConversationTitle(ai, 'model', '  How does photosynthesis work?  ')
		expect(title).toBe('Photosynthesis Basics')
		const input = run.mock.calls[0][1] as { messages: Array<{ content: string; role: string }> }
		expect(input.messages.at(-1)).toEqual({ content: 'How does photosynthesis work?', role: 'user' })
	})

	it('returns null when the message is blank', async () => {
		const run = vi.fn()
		const ai: AIRunner = { run }
		expect(await generateConversationTitle(ai, 'model', '   ')).toBeNull()
		expect(run).not.toHaveBeenCalled()
	})
})
