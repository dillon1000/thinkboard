import { STUDY_MODELS } from '@agentboard/shared'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText } from 'ai'
import { describe, expect, it } from 'vitest'

describe('Study model providers on AI SDK 6', () => {
	it('adapts the quicker model to the AI SDK 6 runtime', async () => {
		const encoder = new TextEncoder()
		let capturedRequest: unknown
		const openRouter = createOpenRouter({
			apiKey: 'test-key',
			baseURL: 'https://gateway.example/openrouter/v1',
			compatibility: 'strict',
			fetch: async (input, init) => {
				capturedRequest = {
					body: JSON.parse(String(init?.body)),
					url: input.toString(),
				}
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"Hello from OpenRouter"}}]}\n\n'))
						controller.enqueue(encoder.encode('data: [DONE]\n\n'))
						controller.close()
					},
				})
				return new Response(stream, {
					headers: { 'content-type': 'text/event-stream' },
				})
			},
		})
		const result = streamText({
			model: openRouter(STUDY_MODELS.quicker.id),
			prompt: 'Say hello.',
		})

		expect(await result.text).toBe('Hello from OpenRouter')
		expect(capturedRequest).toMatchObject({
			body: { model: 'thinkingmachines/inkling' },
			url: 'https://gateway.example/openrouter/v1/chat/completions',
		})
	})

	it('streams reasoning from the smarter model as reasoning text', async () => {
		const encoder = new TextEncoder()
		let capturedRequest: unknown
		const openRouter = createOpenRouter({
			apiKey: 'test-key',
			baseURL: 'https://gateway.example/openrouter/v1',
			compatibility: 'strict',
			fetch: async (input, init) => {
				capturedRequest = {
					body: JSON.parse(String(init?.body)),
					url: input.toString(),
				}
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"reasoning":"The student flipped the "}}]}\n\n'))
						controller.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"reasoning":"chain rule order."}}]}\n\n'))
						controller.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"Differentiate the outer function first."}}]}\n\n'))
						controller.enqueue(encoder.encode('data: [DONE]\n\n'))
						controller.close()
					},
				})
				return new Response(stream, {
					headers: { 'content-type': 'text/event-stream' },
				})
			},
		})
		const result = streamText({
			model: openRouter(STUDY_MODELS.smarter.id),
			prompt: 'Why is my derivative wrong?',
			providerOptions: {
				openrouter: { reasoning: { effort: 'medium' } },
			},
		})

		expect(await result.text).toBe('Differentiate the outer function first.')
		expect(await result.reasoningText).toBe('The student flipped the chain rule order.')
		expect(capturedRequest).toMatchObject({
			body: {
				model: 'meta/muse-spark-1.1',
				reasoning: {
					effort: 'medium',
				},
			},
			url: 'https://gateway.example/openrouter/v1/chat/completions',
		})
	})

	it('sends a base64 selection image as a current image URL content part', async () => {
		const encoder = new TextEncoder()
		let capturedRequest: unknown
		const openRouter = createOpenRouter({
			apiKey: 'test-key',
			baseURL: 'https://gateway.example/openrouter/v1',
			compatibility: 'strict',
			fetch: async (_input, init) => {
				capturedRequest = JSON.parse(String(init?.body))
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"18"}}]}\n\n'))
						controller.enqueue(encoder.encode('data: [DONE]\n\n'))
						controller.close()
					},
				})
				return new Response(stream, {
					headers: { 'content-type': 'text/event-stream' },
				})
			},
		})
		const result = streamText({
			model: openRouter(STUDY_MODELS.quicker.id),
			messages: [{
				role: 'user',
				content: [
					{ type: 'text', text: 'Solve the current selection.' },
					{ type: 'file', data: 'bmV3LWltYWdl', mediaType: 'image/jpeg' },
				],
			}],
		})

		expect(await result.text).toBe('18')
		expect(capturedRequest).toMatchObject({
			messages: [{
				role: 'user',
				content: [
					{ type: 'text', text: 'Solve the current selection.' },
					{
						type: 'image_url',
						image_url: { url: 'data:image/jpeg;base64,bmV3LWltYWdl' },
					},
				],
			}],
		})
	})
})
