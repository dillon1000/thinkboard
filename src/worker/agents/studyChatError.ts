import { APICallError } from '@ai-sdk/provider'
import { RetryError } from 'ai'

const FALLBACK_MESSAGE = 'The study partner could not finish that response.'
const MAX_CLIENT_MESSAGE_LENGTH = 600

/** Returns a useful provider error for the client without exposing request data, headers, or stacks. */
export function getStudyChatClientError(error: unknown): string {
	const apiError = findAPICallError(error)
	if (!apiError) return FALLBACK_MESSAGE

	const providerMessage = getProviderMessage(apiError)
	const status = apiError.statusCode ? ` ${apiError.statusCode}` : ''
	if (!providerMessage) return `OpenRouter${status} request failed.`
	return truncate(`OpenRouter${status}: ${providerMessage}`)
}

/** Returns structured fields that Cloudflare can index without logging provider request data. */
export function getStudyChatErrorLog(error: unknown) {
	const apiError = findAPICallError(error)
	if (!apiError) {
		return {
			message: error instanceof Error ? error.message : String(error),
			name: error instanceof Error ? error.name : 'UnknownError',
		}
	}

	return {
		isRetryable: apiError.isRetryable,
		message: getProviderMessage(apiError) || apiError.message,
		name: apiError.name,
		statusCode: apiError.statusCode,
	}
}

function findAPICallError(error: unknown, depth = 0): APICallError | null {
	if (depth > 4) return null
	if (APICallError.isInstance(error)) return error
	if (RetryError.isInstance(error)) return findAPICallError(error.lastError, depth + 1)
	if (error instanceof Error && error.cause) return findAPICallError(error.cause, depth + 1)
	return null
}

function getProviderMessage(error: APICallError): string {
	const message = readProviderMessage(error.data)
		?? readProviderMessage(parseResponseBody(error.responseBody))
		?? error.message
	return message.trim().replace(/\s+/g, ' ')
}

function parseResponseBody(responseBody: string | undefined): unknown {
	if (!responseBody) return null
	try {
		return JSON.parse(responseBody)
	} catch {
		return null
	}
}

function readProviderMessage(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null
	const error = Reflect.get(value, 'error')
	if (!error || typeof error !== 'object') return null
	const message = Reflect.get(error, 'message')
	return typeof message === 'string' && message.trim() ? message : null
}

function truncate(message: string) {
	if (message.length <= MAX_CLIENT_MESSAGE_LENGTH) return message
	return `${message.slice(0, MAX_CLIENT_MESSAGE_LENGTH - 1)}…`
}
