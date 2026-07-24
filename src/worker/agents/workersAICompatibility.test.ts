import { STUDY_MODELS } from '@agentboard/shared'
import { streamText } from 'ai'
import { describe, expect, it } from 'vitest'
import { createWorkersAI } from 'workers-ai-provider'

describe('Workers AI on AI SDK 6', () => {
	it.each(Object.values(STUDY_MODELS))('adapts $id to the AI SDK 6 runtime', async ({ id }) => {
		const encoder = new TextEncoder()
		const binding = {
			run: () => new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode('data: {"response":"Hello from Workers AI"}\n\n'))
					controller.enqueue(encoder.encode('data: [DONE]\n\n'))
					controller.close()
				},
			}),
		} as unknown as Ai
		const workersAI = createWorkersAI({ binding })
		const result = streamText({
			model: workersAI(id),
			prompt: 'Say hello.',
		})

		expect(await result.text).toBe('Hello from Workers AI')
	})

	it('streams reasoning from the smarter model as reasoning text', async () => {
		const encoder = new TextEncoder()
		let capturedInputs: unknown
		const binding = {
			run: (_modelID: string, inputs: unknown) => {
				capturedInputs = inputs
				return new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"The student flipped the "}}]}\n\n'))
						controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"chain rule order."}}]}\n\n'))
						controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Differentiate the outer function first."}}]}\n\n'))
						controller.enqueue(encoder.encode('data: [DONE]\n\n'))
						controller.close()
					},
				})
			},
		} as unknown as Ai
		const workersAI = createWorkersAI({ binding })
		const result = streamText({
			model: workersAI(STUDY_MODELS.smarter.id, { reasoning_effort: 'medium' }),
			prompt: 'Why is my derivative wrong?',
		})

		expect(await result.text).toBe('Differentiate the outer function first.')
		expect(await result.reasoningText).toBe('The student flipped the chain rule order.')
		expect(capturedInputs).toMatchObject({ reasoning_effort: 'medium' })
	})

	it('sends a base64 selection image as a current image URL content part', async () => {
		const encoder = new TextEncoder()
		let capturedInputs: unknown
		const binding = {
			run: (_modelID: string, inputs: unknown) => {
				capturedInputs = inputs
				return new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(encoder.encode('data: {"response":"18"}\n\n'))
						controller.enqueue(encoder.encode('data: [DONE]\n\n'))
						controller.close()
					},
				})
			},
		} as unknown as Ai
		const workersAI = createWorkersAI({ binding })
		const result = streamText({
			model: workersAI(STUDY_MODELS.quicker.id),
			messages: [{
				role: 'user',
				content: [
					{ type: 'text', text: 'Solve the current selection.' },
					{ type: 'file', data: 'bmV3LWltYWdl', mediaType: 'image/jpeg' },
				],
			}],
		})

		expect(await result.text).toBe('18')
		expect(capturedInputs).toMatchObject({
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
