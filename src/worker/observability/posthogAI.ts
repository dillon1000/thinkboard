import type { JsonRecord, JsonType } from 'posthog-js'
import { z } from 'zod'

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'
const MAX_CAPTURE_STRING_LENGTH = 20_000
const MAX_CAPTURE_ARRAY_LENGTH = 100
const MAX_CAPTURE_OBJECT_KEYS = 100
const MAX_CAPTURE_DEPTH = 8

const captureStringSchema = z.string()
const captureScalarSchema = z.union([z.number(), z.boolean(), z.null()])
const captureObjectSchema = z.looseObject({})
const modelInputSchema = z.looseObject({
	max_completion_tokens: z.number().optional(),
	max_tokens: z.number().optional(),
	messages: z.array(z.json()).optional(),
	temperature: z.number().optional(),
	text: z.union([z.string(), z.array(z.string())]).optional(),
})
const modelOutputSchema = z.looseObject({
	response: z.json().optional(),
	result: z.json().optional(),
	text: z.json().optional(),
	usage: z.looseObject({
		completion_tokens: z.number().optional(),
		input_tokens: z.number().optional(),
		output_tokens: z.number().optional(),
		prompt_tokens: z.number().optional(),
	}).optional(),
})
const gatewayOptionsSchema = z.looseObject({
	gateway: z.looseObject({
		metadata: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).optional(),
	}).optional(),
})

interface PostHogAIEnv {
	POSTHOG_AI_PRIVACY_MODE?: string
	POSTHOG_HOST?: string
	POSTHOG_PROJECT_TOKEN?: string
}

export interface AIRunner {
	run<Input, Options>(model: string, input: Input, options?: Options): Promise<JsonType>
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

interface CapturedError extends JsonRecord {
	message: string
	name: string
}

interface AIGenerationCapture<Input, Output, Failure> extends Omit<AIObservation, 'defer'> {
	error?: Failure
	input: Input
	inputTokens?: number
	latencySeconds: number
	maxTokens?: number
	model: string
	output?: Output
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
export async function capturePostHogAIEvent<Input, Output, Failure>(
	env: PostHogAIEnv,
	capture: AIGenerationCapture<Input, Output, Failure>,
	fetcher: Fetcher = fetch
): Promise<void> {
	const projectToken = env.POSTHOG_PROJECT_TOKEN?.trim()
	if (!projectToken) return

	const event = capture.kind === 'embedding' ? '$ai_embedding' : '$ai_generation'
	const privacyMode = env.POSTHOG_AI_PRIVACY_MODE?.trim().toLowerCase() === 'true'
	const properties: JsonRecord = {
		distinct_id: capture.distinctID,
		$ai_error: capture.error === undefined ? undefined : readError(capture.error),
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

function inferEventKind<Input>(input: Input): AIEventKind {
	const parsed = modelInputSchema.safeParse(input)
	if (!parsed.success) return 'generation'
	return parsed.data.text !== undefined && parsed.data.messages === undefined
		? 'embedding'
		: 'generation'
}

function readModelInput<Input>(input: Input): JsonType {
	const parsed = modelInputSchema.safeParse(input)
	if (!parsed.success) return sanitizeCaptureValue(input)
	if (parsed.data.messages !== undefined) return sanitizeCaptureValue(parsed.data.messages)
	if (parsed.data.text !== undefined) return sanitizeCaptureValue(parsed.data.text)
	return sanitizeCaptureValue(input)
}

function readModelOutput<Output>(output: Output): JsonType {
	const parsed = modelOutputSchema.safeParse(output)
	if (!parsed.success) return sanitizeCaptureValue(output)
	if (parsed.data.response !== undefined) return sanitizeCaptureValue(parsed.data.response)
	if (parsed.data.result !== undefined) return sanitizeCaptureValue(parsed.data.result)
	if (parsed.data.text !== undefined) return sanitizeCaptureValue(parsed.data.text)
	return sanitizeCaptureValue(output)
}

function readUsageNumber<Output>(
	output: Output,
	keys: readonly ('completion_tokens' | 'input_tokens' | 'output_tokens' | 'prompt_tokens')[]
) {
	const parsed = modelOutputSchema.safeParse(output)
	if (!parsed.success || !parsed.data.usage) return undefined
	for (const key of keys) {
		const value = parsed.data.usage[key]
		if (value !== undefined) return value
	}
	return undefined
}

function readInputNumber<Input>(
	input: Input,
	keys: readonly ('max_completion_tokens' | 'max_tokens' | 'temperature')[]
) {
	const parsed = modelInputSchema.safeParse(input)
	if (!parsed.success) return undefined
	for (const key of keys) {
		const value = parsed.data[key]
		if (value !== undefined) return value
	}
	return undefined
}

function readGatewayMetadata<Options>(options: Options): Record<string, AIProperty> {
	const parsed = gatewayOptionsSchema.safeParse(options)
	return parsed.success ? parsed.data.gateway?.metadata ?? {} : {}
}

/**
 * Converts model data to bounded JSON for PostHog. The limits prevent large images, prompts, and
 * deeply nested provider payloads from increasing event size or capture cost without bound.
 */
function sanitizeCaptureValue<Value>(value: Value, depth = 0): JsonType {
	if (depth >= MAX_CAPTURE_DEPTH) return '[nested value omitted]'
	const stringValue = captureStringSchema.safeParse(value)
	if (stringValue.success) {
		if (stringValue.data.startsWith('data:')) return '[data URL omitted]'
		return stringValue.data.length > MAX_CAPTURE_STRING_LENGTH
			? `${stringValue.data.slice(0, MAX_CAPTURE_STRING_LENGTH)}…`
			: stringValue.data
	}
	const scalar = captureScalarSchema.safeParse(value)
	if (scalar.success) return scalar.data
	if (Array.isArray(value)) {
		return value
			.slice(0, MAX_CAPTURE_ARRAY_LENGTH)
			.map((item) => sanitizeCaptureValue(item, depth + 1))
	}
	const object = captureObjectSchema.safeParse(value)
	if (!object.success) return String(value)
	return Object.fromEntries(
		Object.entries(object.data)
			.slice(0, MAX_CAPTURE_OBJECT_KEYS)
			.map(([key, item]) => [key, sanitizeCaptureValue(item, depth + 1)])
	)
}

function removeEmptyProperties(properties: JsonRecord): JsonRecord {
	return Object.fromEntries(
		Object.entries(properties).filter(([, value]) => value !== null && value !== undefined)
	)
}

function readError<Failure>(error: Failure): CapturedError {
	return {
		message: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
		name: error instanceof Error ? error.name : 'UnknownError',
	}
}

function elapsedSeconds(startedAt: number) {
	return Math.max(0, (performance.now() - startedAt) / 1_000)
}
