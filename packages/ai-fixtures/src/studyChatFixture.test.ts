import { describe, expect, it } from 'vitest'
import { studyChatFixture } from './studyChatFixture'

describe('studyChatFixture', () => {
	it('models the streamed flashcard workflow without revealing answers in text', () => {
		const messages = studyChatFixture.get()
		const assistant = messages.find((message) => message.role === 'assistant')
		const visibleText = assistant?.parts
			.filter((part) => part.type === 'text')
			.map((part) => part.text)
			.join(' ') ?? ''

		expect(studyChatFixture.next([])?.id).toBe('study-user-flashcards')
		expect(visibleText).toContain('three flashcards')
		expect(visibleText).not.toContain('Instantaneous rate of change')
		expect(assistant?.parts.some((part) => part.type === 'tool-createFlashcards')).toBe(true)
	})

	it('streams text, data, and the flashcard tool lifecycle offline', async () => {
		const transport = studyChatFixture.transport({ delayMs: 0 })
		const userMessage = studyChatFixture.next([])
		expect(userMessage).not.toBeNull()
		if (!userMessage) return

		const stream = await transport.sendMessages({
			abortSignal: undefined,
			chatId: 'study-fixture-test',
			messageId: undefined,
			messages: [userMessage],
			trigger: 'submit-message',
		})
		const chunkTypes: string[] = []
		const reader = stream.getReader()
		while (true) {
			const result = await reader.read()
			if (result.done) break
			chunkTypes.push(result.value.type)
		}

		expect(chunkTypes).toContain('text-delta')
		expect(chunkTypes.some((type) => type.startsWith('data-'))).toBe(true)
		expect(chunkTypes.some((type) => type.startsWith('tool-'))).toBe(true)
	})
})
