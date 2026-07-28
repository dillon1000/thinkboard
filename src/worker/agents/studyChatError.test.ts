import { APICallError } from '@ai-sdk/provider'
import { RetryError } from 'ai'
import { describe, expect, it } from 'vitest'
import {
	getStudyChatClientError,
	getStudyChatErrorLog,
} from './studyChatError'

function createAPIError(overrides: Partial<ConstructorParameters<typeof APICallError>[0]> = {}) {
	return new APICallError({
		message: '',
		requestBodyValues: { messages: ['private prompt'] },
		responseBody: JSON.stringify({
			error: { code: 503, message: 'No available provider supports all requested parameters.' },
		}),
		statusCode: 503,
		url: 'https://openrouter.ai/api/v1/chat/completions',
		...overrides,
	})
}

describe('getStudyChatClientError', () => {
	it('surfaces the OpenRouter status and response message', () => {
		expect(getStudyChatClientError(createAPIError())).toBe(
			'OpenRouter 503: No available provider supports all requested parameters.'
		)
	})

	it('unwraps an API error after retries', () => {
		const error = new RetryError({
			errors: [createAPIError()],
			message: 'Failed after retries',
			reason: 'maxRetriesExceeded',
		})

		expect(getStudyChatClientError(error)).toBe(
			'OpenRouter 503: No available provider supports all requested parameters.'
		)
	})

	it('does not expose an unknown internal error', () => {
		expect(getStudyChatClientError(new Error('Database password was invalid'))).toBe(
			'The study partner could not finish that response.'
		)
	})
})

describe('getStudyChatErrorLog', () => {
	it('keeps indexed provider fields and omits request data', () => {
		expect(getStudyChatErrorLog(createAPIError())).toEqual({
			isRetryable: true,
			message: 'No available provider supports all requested parameters.',
			name: 'AI_APICallError',
			statusCode: 503,
		})
	})
})
