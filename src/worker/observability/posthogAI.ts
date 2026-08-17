import { readProperty } from '@agentboard/shared'
import { hasObjectType, isBoolean, isNumber, isString } from '@agentboard/shared'
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'
const MAX_CAPTURE_STRING_LENGTH = 20_000
const MAX_CAPTURE_ARRAY_LENGTH = 100
const MAX_CAPTURE_OBJECT_KEYS = 100
const MAX_CAPTURE_DEPTH = 8

interface PostHogAIEnv {
	POSTHOG_AI_PRIVACY_MODE?: string
	POSTHOG_HOST?: string
	POSTHOG_PROJECT_TOKEN?: string
}

export interface AIRunner {
	run(model: string, input: unknown, options?: unknown): Promise<unknown>
}

type AIProperty = boolean | number | string
type AIEventKind = 'embedding' | 'generation'
type Defer = (promise: Promise<void>) => void
type Fetcher = typeof fetch

interface AIObservation {
	defer: Defer
	distinctID: string
	kind?: AIEventKind
	properties?: Record<string, AIProperty | null | undefined>
	provider: string
	sessionID?: string
	spanName: string
	traceID: string
}

interface AIGenerationCapture extends Omit<AIObservation, 'defer'> {
	error?: unknown
	input: unknown
	inputTokens?: number
	latencySeconds: number
	maxTokens?: number
	model: string
	output?: unknown
	outputTokens?: number
	stopReason?: string
	stream?: boolean
	temperature?: number
	timeToFirstTokenSeconds?: number
}

/**
 * Adds PostHog capture to a Workers AI runner. The original model result and error behavior stay
 * unchanged. Capture uses the request lifetime supplied by the caller and never blocks the model.
 */
export function observeAIRunner(
	runner: AIRunner,
	env: PostHogAIEnv,
	observation: AIObservation
): AIRunner {
	return {
		async run(model, input, options) {
			const startedAt = performance.now()
			try {
				const output = await runner.run(model, input, options)
				scheduleCapture(observation.defer, capturePostHogAIEvent(env, {
					...observation,
					input: readModelInput(input),
					inputTokens: readUsageNumber(output, ['input_tokens', 'prompt_tokens']),
					kind: observation.kind ?? inferEventKind(input),
					latencySeconds: elapsedSeconds(startedAt),
					maxTokens: readInputNumber(input, ['max_tokens', 'max_completion_tokens']),
					model,
					output: readModelOutput(output),
					outputTokens: readUsageNumber(output, ['output_tokens', 'completion_tokens']),
					properties: {
						...readGatewayMetadata(options),
						...observation.properties,
					},
					temperature: readInputNumber(input, ['temperature']),
				}))
				return output
			} catch (error) {
				scheduleCapture(observation.defer, capturePostHogAIEvent(env, {
					...observation,
					error,
					input: readModelInput(input),
					kind: observation.kind ?? inferEventKind(input),
					latencySeconds: elapsedSeconds(startedAt),
					maxTokens: readInputNumber(input, ['max_tokens', 'max_completion_tokens']),
					model,
					properties: {
						...readGatewayMetadata(options),
						...observation.properties,
					},
					temperature: readInputNumber(input, ['temperature']),
				}))
				throw error
			}
		},
	}
}

/**
 * Sends one PostHog AI event through the public capture endpoint. A missing project token disables
 * capture. Network and ingestion errors are logged and do not change the AI request outcome.
 */
export async function capturePostHogAIEvent(
	env: PostHogAIEnv,
	capture: AIGenerationCapture,
	fetcher: Fetcher = fetch
): Promise<void> {
	const projectToken = env.POSTHOG_PROJECT_TOKEN?.trim()
	if (!projectToken) return

	const event = capture.kind === 'embedding' ? '$ai_embedding' : '$ai_generation'
	const privacyMode = env.POSTHOG_AI_PRIVACY_MODE?.trim().toLowerCase() === 'true'
	const properties: Record<string, unknown> = {
		distinct_id: capture.distinctID,
		$ai_error: capture.error ? readError(capture.error) : undefined,
		$ai_input_tokens: capture.inputTokens,
		$ai_is_error: Boolean(capture.error),
		$ai_latency: capture.latencySeconds,
		$ai_model: capture.model,
		$ai_output_tokens: capture.outputTokens,
		$ai_provider: capture.provider,
		$ai_session_id: capture.sessionID,
		$ai_span_id: crypto.randomUUID(),
		$ai_span_name: capture.spanName,
		$ai_stop_reason: capture.stopReason,
		$ai_stream: capture.stream,
		$ai_temperature: capture.temperature,
		$ai_max_tokens: capture.maxTokens,
		$ai_time_to_first_token: capture.timeToFirstTokenSeconds,
		$ai_trace_id: capture.traceID,
		...removeEmptyProperties(capture.properties ?? {}),
	}
	if (!privacyMode) {
		properties.$ai_input = sanitizeCaptureValue(capture.input)
		if (capture.kind !== 'embedding' && capture.output !== undefined) {
			properties.$ai_output_choices = [{
				content: sanitizeCaptureValue(capture.output),
				role: 'assistant',
			}]
		}
	}

	const host = (env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST).replace(/\/+$/, '')
	try {
		const response = await fetcher(`${host}/i/v0/e/`, {
			body: JSON.stringify({
				api_key: projectToken,
				event,
				properties: removeEmptyProperties(properties),
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		})
		if (!response.ok) {
			console.warn(`PostHog AI capture failed with status ${response.status}`)
		}
	} catch (error) {
		console.warn('PostHog AI capture failed', readError(error))
	}
}

function scheduleCapture(defer: Defer, capture: Promise<void>) {
	const handled = capture.catch((error) => {
		console.warn('PostHog AI capture failed', readError(error))
	})
	defer(handled)
}

function inferEventKind(input: unknown): AIEventKind {
	if (!input || !hasObjectType(input)) return 'generation'
	const text = readProperty(input, 'text')
	const messages = readProperty(input, 'messages')
	return (isString(text) || Array.isArray(text)) && !Array.isArray(messages)
		? 'embedding'
		: 'generation'
}

function readModelInput(input: unknown) {
	if (!input || !hasObjectType(input)) return input
	const messages = readProperty(input, 'messages')
	if (Array.isArray(messages)) return messages
	const text = readProperty(input, 'text')
	return isString(text) || Array.isArray(text) ? text : input
}

function readModelOutput(output: unknown) {
	if (!output || !hasObjectType(output)) return output
	for (const key of ['response', 'result', 'text']) {
		const value = readProperty(output, key)
		if (value !== undefined) return value
	}
	return output
}

function readUsageNumber(output: unknown, keys: readonly string[]) {
	if (!output || !hasObjectType(output)) return undefined
	const usage = readProperty(output, 'usage')
	if (!usage || !hasObjectType(usage)) return undefined
	for (const key of keys) {
		const value = readProperty(usage, key)
		if (isNumber(value)) return value
	}
	return undefined
}

function readInputNumber(input: unknown, keys: readonly string[]) {
	if (!input || !hasObjectType(input)) return undefined
	for (const key of keys) {
		const value = readProperty(input, key)
		if (isNumber(value)) return value
	}
	return undefined
}

function readGatewayMetadata(options: unknown): Record<string, AIProperty> {
	if (!options || !hasObjectType(options)) return {}
	const gateway = readProperty(options, 'gateway')
	if (!gateway || !hasObjectType(gateway)) return {}
	const metadata = readProperty(gateway, 'metadata')
	if (!metadata || !hasObjectType(metadata)) return {}
	return Object.fromEntries(
		Object.entries(metadata).filter(
			(entry): entry is [string, AIProperty] =>
				isBoolean(entry[1])
				|| isNumber(entry[1])
				|| isString(entry[1])
		)
	)
}

function sanitizeCaptureValue(value: unknown, depth = 0): unknown {
	if (depth >= MAX_CAPTURE_DEPTH) return '[nested value omitted]'
	if (isString(value)) {
		if (value.startsWith('data:')) return '[data URL omitted]'
		return value.length > MAX_CAPTURE_STRING_LENGTH
			? `${value.slice(0, MAX_CAPTURE_STRING_LENGTH)}…`
			: value
	}
	if (isNumber(value) || isBoolean(value) || value === null) return value
	if (Array.isArray(value)) {
		return value
			.slice(0, MAX_CAPTURE_ARRAY_LENGTH)
			.map((item) => sanitizeCaptureValue(item, depth + 1))
	}
	if (!value || !hasObjectType(value)) return String(value)
	return Object.fromEntries(
		Object.entries(value)
			.slice(0, MAX_CAPTURE_OBJECT_KEYS)
			.map(([key, item]) => [key, sanitizeCaptureValue(item, depth + 1)])
	)
}

function removeEmptyProperties<T extends Record<string, unknown>>(properties: T) {
	return Object.fromEntries(
		Object.entries(properties).filter(([, value]) => value !== null && value !== undefined)
	)
}

function readError(error: unknown) {
	return {
		message: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
		name: error instanceof Error ? error.name : 'UnknownError',
	}
}

function elapsedSeconds(startedAt: number) {
	return Math.max(0, (performance.now() - startedAt) / 1_000)
}
