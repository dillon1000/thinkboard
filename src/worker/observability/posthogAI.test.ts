import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
	capturePostHogAIEvent,
	observeAIRunner,
	type AIRunner,
} from './posthogAI'

const observation = {
	defer: (promise: Promise<void>) => promise,
	distinctID: 'user-1',
	properties: { board_id: 'board-1' },
	provider: 'cloudflare',
	sessionID: 'session-1',
	spanName: 'flashcard-answer',
	traceID: 'trace-1',
}

const captureBodySchema = z.object({
	api_key: z.string().optional(),
	event: z.string().optional(),
	properties: z.record(z.string(), z.json()),
})

describe('capturePostHogAIEvent', () => {
	it('does nothing when the project token is missing', async () => {
		const fetcher = vi.fn<typeof fetch>()
		await capturePostHogAIEvent({}, {
			...observation,
			input: [],
			latencySeconds: 0.5,
			model: 'model',
		}, fetcher)
		expect(fetcher).not.toHaveBeenCalled()
	})

	it('captures a generation and omits large data URLs', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
		await capturePostHogAIEvent({
			POSTHOG_HOST: 'https://eu.i.posthog.com/',
			POSTHOG_PROJECT_TOKEN: 'phc_test',
		}, {
			...observation,
			input: [{
				content: [
					{ image_url: { url: 'data:image/png;base64,secret' }, type: 'image_url' },
					{ text: 'Question', type: 'text' },
				],
				role: 'user',
			}],
			inputTokens: 12,
			latencySeconds: 0.5,
			model: 'model',
			output: 'Answer',
			outputTokens: 4,
			stream: true,
		}, fetcher)

		expect(fetcher).toHaveBeenCalledOnce()
		expect(fetcher.mock.calls[0][0]).toBe('https://eu.i.posthog.com/i/v0/e/')
		const request = fetcher.mock.calls[0][1]
		const body = captureBodySchema.parse(JSON.parse(String(request?.body)))
		expect(body).toMatchObject({
			api_key: 'phc_test',
			event: '$ai_generation',
			properties: {
				$ai_input_tokens: 12,
				$ai_model: 'model',
				$ai_output_choices: [{ content: 'Answer', role: 'assistant' }],
				$ai_output_tokens: 4,
				$ai_stream: true,
				$ai_trace_id: 'trace-1',
				board_id: 'board-1',
				distinct_id: 'user-1',
			},
		})
		expect(JSON.stringify(body)).not.toContain('base64,secret')
	})

	it('supports privacy mode and embedding events', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
		await capturePostHogAIEvent({
			POSTHOG_AI_PRIVACY_MODE: 'true',
			POSTHOG_PROJECT_TOKEN: 'phc_test',
		}, {
			...observation,
			input: ['private study notes'],
			kind: 'embedding',
			latencySeconds: 0.1,
			model: 'embedding-model',
		}, fetcher)

		const body = captureBodySchema.parse(JSON.parse(String(fetcher.mock.calls[0][1]?.body)))
		expect(body.event).toBe('$ai_embedding')
		expect(body.properties).not.toHaveProperty('$ai_input')
		expect(body.properties).not.toHaveProperty('$ai_output_choices')
	})
})

describe('observeAIRunner', () => {
	it('preserves the result and schedules capture metadata', async () => {
		const result = {
			response: 'Answer',
			usage: { completion_tokens: 3, prompt_tokens: 8 },
		}
		const runner: AIRunner = { run: vi.fn().mockResolvedValue(result) }
		const deferred: Promise<void>[] = []
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
		vi.stubGlobal('fetch', fetcher)
		const observed = observeAIRunner(runner, {
			POSTHOG_PROJECT_TOKEN: 'phc_test',
		}, {
			...observation,
			defer: (promise) => {
				deferred.push(promise)
			},
		})

		await expect(observed.run('model', {
			max_tokens: 20,
			messages: [{ content: 'Question', role: 'user' }],
			temperature: 0.2,
		}, {
			gateway: { metadata: { pipeline: 'flashcard-answer' } },
		})).resolves.toBe(result)
		await Promise.all(deferred)

		const body = captureBodySchema.parse(JSON.parse(String(fetcher.mock.calls[0][1]?.body)))
		expect(body.properties).toMatchObject({
			$ai_input_tokens: 8,
			$ai_max_tokens: 20,
			$ai_output_tokens: 3,
			$ai_temperature: 0.2,
			pipeline: 'flashcard-answer',
		})
		vi.unstubAllGlobals()
	})

	it('reports errors and rethrows the original error', async () => {
		const failure = new Error('Model unavailable')
		const runner: AIRunner = { run: vi.fn().mockRejectedValue(failure) }
		const deferred: Promise<void>[] = []
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
		vi.stubGlobal('fetch', fetcher)
		const observed = observeAIRunner(runner, {
			POSTHOG_PROJECT_TOKEN: 'phc_test',
		}, {
			...observation,
			defer: (promise) => {
				deferred.push(promise)
			},
		})

		await expect(observed.run('model', { messages: [] })).rejects.toBe(failure)
		await Promise.all(deferred)
		const body = captureBodySchema.parse(JSON.parse(String(fetcher.mock.calls[0][1]?.body)))
		expect(body.properties).toMatchObject({
			$ai_error: { message: 'Model unavailable', name: 'Error' },
			$ai_is_error: true,
		})
		vi.unstubAllGlobals()
	})
})
