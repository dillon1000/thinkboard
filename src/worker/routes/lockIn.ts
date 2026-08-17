import { readProperty } from '@agentboard/shared'
import { hasObjectType, isString } from '@agentboard/shared'
import {
	lockInReviewRequestSchema,
	lockInReviewResponseSchema,
	lockInReviewStatusSchema,
	type LockInReviewRequest,
	type LockInReviewResponse,
	type LockInReviewStatus,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { requireSession } from '../auth/session'
import { getBoardAccess } from '../db/boards'
import { createDatabase } from '../db/client'
import {
	observeAIRunner,
	type AIRunner,
} from '../observability/posthogAI'

export type { AIRunner } from '../observability/posthogAI'

const DEFAULT_LOCK_IN_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'

const lockInModelResponseSchema = lockInReviewResponseSchema.omit({ reviewedAt: true })

const LOCK_IN_REVIEW_JSON_SCHEMA = {
	additionalProperties: false,
	properties: {
		coach: {
			description: 'One concrete, encouraging next action the student can take immediately.',
			maxLength: 400,
			minLength: 1,
			type: 'string',
		},
		evidence: {
			description: 'A concise visual observation that explains the classification.',
			maxLength: 280,
			minLength: 1,
			type: 'string',
		},
		headline: {
			description: 'A short status headline written directly to the student.',
			maxLength: 100,
			minLength: 1,
			type: 'string',
		},
		status: {
			enum: ['on-track', 'drifting', 'stalled', 'unclear', 'complete'],
			type: 'string',
		},
	},
	required: ['status', 'headline', 'coach', 'evidence'],
	type: 'object',
} as const

export async function handleLockInReview(
	request: IRequest,
	env: Env,
	ctx: ExecutionContext
) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response

	const boardID = request.params.boardID
	const access = await getBoardAccess(
		createDatabase(env),
		boardID,
		authentication.session.user.id
	)
	if (!access) return Response.json({ error: 'Space not found' }, { status: 404 })

	const body: unknown = await request.json().catch(() => null)
	const parsed = lockInReviewRequestSchema.safeParse(body)
	if (!parsed.success) {
		return Response.json({ error: 'Invalid Lock In review request' }, { status: 400 })
	}

	try {
		const aiOptions = {
			gateway: {
				id: env.AI_GATEWAY_ID ?? 'default',
				metadata: {
					boardID,
					pipeline: 'lock-in-review',
					sessionID: parsed.data.sessionID,
				},
			},
			tags: ['agentboard', 'lock-in-review'],
		}
		const traceID = crypto.randomUUID()
		const review = await generateLockInReview(
			observeAIRunner(env.AI as AIRunner, env, {
				defer: (capture) => ctx.waitUntil(capture),
				distinctID: authentication.session.user.id,
				properties: { board_id: boardID, surface: 'lock-in' },
				provider: 'cloudflare',
				sessionID: parsed.data.sessionID,
				spanName: 'lock-in-review',
				traceID,
			}),
			env.LOCK_IN_MODEL ?? DEFAULT_LOCK_IN_MODEL,
			parsed.data,
			aiOptions
		)
		return Response.json(review)
	} catch (error) {
		console.error(JSON.stringify({
			boardID,
			error: error instanceof Error ? error.message : 'Unknown Lock In review error',
			pipeline: 'lock-in-review',
			sessionID: parsed.data.sessionID,
		}))
		return Response.json({ error: 'Focus coach could not review the canvas' }, { status: 502 })
	}
}

export function createLockInReviewMessages(review: LockInReviewRequest) {
	const imageContent: Array<{
		image_url?: { url: string }
		text?: string
		type: string
	}> = [
		{
			text: `The first image is the complete current canvas. The student’s stated goal is: "${review.goal}". Their finish line is: "${review.finishLine}". They are ${formatElapsedMinutes(review.elapsedMinutes)} into the session.`,
			type: 'text',
		},
		{
			image_url: { url: toDataURL(review.canvasImage) },
			type: 'image_url',
		},
	]

	if (review.changesImage) {
		imageContent.push(
			{
				text: `The second image isolates the ${review.changedShapeCount} canvas shape${review.changedShapeCount === 1 ? '' : 's'} changed during the last ${review.intervalSeconds} seconds. Weight this image most heavily when judging the student’s current direction.`,
				type: 'text',
			},
			{
				image_url: { url: toDataURL(review.changesImage) },
				type: 'image_url',
			}
		)
	} else {
		imageContent.push({
			text: review.changedShapeCount > 0
				? `${review.changedShapeCount} canvas shape${review.changedShapeCount === 1 ? ' was' : 's were'} changed during the last ${review.intervalSeconds} seconds, but none remain visible in the current canvas. This can indicate deletion; judge it against the complete canvas without inventing what was removed.`
				: `No canvas shapes changed during the last ${review.intervalSeconds} seconds. Treat inactivity as stalled only when the visible work and finish line make that conclusion reasonable.`,
			type: 'text',
		})
	}

	imageContent.push({
		text: 'Classify the work as on-track, drifting, stalled, unclear, or complete. Complete has a deliberately high bar: use it only when the full canvas visibly satisfies every material part of the stated finish line and the newest edits support that conclusion. Progress, a plausible answer, or a nearly finished artifact is not complete. When in doubt, choose on-track or unclear. Drifting means the recent edits are materially unrelated to or moving away from the stated finish line—not merely that the canvas contains other material. Give one specific next action grounded in what is visibly present; for complete, briefly celebrate the finished work. Never shame the student, invent unseen work, or use generic productivity advice. Your JSON response must contain all four required keys: status, headline, coach, and evidence.',
		type: 'text',
	})

	return [
		{
			content: 'You are Thinkspace’s Focus Coach. Compare a student’s stated finish line with their complete canvas and their newest edits. Be visually precise, calm, and brief. Return only one complete JSON object with status, headline, coach, and evidence. Never omit a key.',
			role: 'system',
		},
		{
			content: imageContent,
			role: 'user',
		},
	]
}

export async function generateLockInReview(
	ai: AIRunner,
	model: string,
	review: LockInReviewRequest,
	options?: unknown,
	reviewedAt = new Date()
): Promise<LockInReviewResponse> {
	const initialResponse = await ai.run(
		model,
		{
			guided_json: LOCK_IN_REVIEW_JSON_SCHEMA,
			max_tokens: 512,
			messages: createLockInReviewMessages(review),
			temperature: 0,
		},
		options
	)
	const initial = tryParseLockInModelResponse(initialResponse, reviewedAt)
	if (initial) return initial

	const initialText = readGeneratedText(initialResponse)
	const recoveryResponse = await ai.run(
		model,
		{
			max_tokens: 420,
			messages: [
				...createLockInReviewMessages(review),
				{
					content: initialText || '{"status":"unclear"}',
					role: 'assistant',
				},
				{
					content: 'Your prior response was incomplete. Re-read the two canvas images and return exactly four single-line fields with no other text:\nSTATUS: on-track | drifting | stalled | unclear | complete\nHEADLINE: a short student-facing headline\nCOACH: one specific next action grounded in the visible canvas, or a brief celebration when complete\nEVIDENCE: one visual observation supporting the status\nUse complete only when every material part of the stated finish line is visibly satisfied.',
					role: 'user',
				},
			],
			temperature: 0,
		},
		options
	)
	const recovered = tryParseLockInModelResponse(recoveryResponse, reviewedAt)
		?? parseTaggedLockInResponse(recoveryResponse, reviewedAt)
	if (recovered) return recovered

	return createSafeLockInFallback(
		readPartialStatus(initialResponse) ?? readPartialStatus(recoveryResponse) ?? 'unclear',
		review,
		reviewedAt
	)
}

export function parseLockInModelResponse(
	value: unknown,
	reviewedAt = new Date()
): LockInReviewResponse {
	const text = readGeneratedText(value)
	const start = text.indexOf('{')
	const end = text.lastIndexOf('}')
	if (start < 0 || end < start) throw new Error('Focus coach returned invalid JSON')
	const candidate: unknown = JSON.parse(text.slice(start, end + 1))
	const result = lockInModelResponseSchema.parse(candidate)
	return {
		...result,
		reviewedAt: reviewedAt.toISOString(),
	}
}

function tryParseLockInModelResponse(value: unknown, reviewedAt: Date) {
	try {
		return parseLockInModelResponse(value, reviewedAt)
	} catch {
		return null
	}
}

function parseTaggedLockInResponse(value: unknown, reviewedAt: Date) {
	const text = readGeneratedText(value)
	const status = matchTaggedField(text, 'STATUS')
	const headline = matchTaggedField(text, 'HEADLINE')
	const coach = matchTaggedField(text, 'COACH')
	const evidence = matchTaggedField(text, 'EVIDENCE')
	const candidate = lockInModelResponseSchema.safeParse({
		coach,
		evidence,
		headline,
		status: status?.toLowerCase(),
	})
	if (!candidate.success) return null
	return {
		...candidate.data,
		reviewedAt: reviewedAt.toISOString(),
	}
}

function matchTaggedField(text: string, label: string) {
	const line = text
		.split(/\r?\n/)
		.find((candidate) => candidate.trim().toUpperCase().startsWith(`${label}:`))
	return line?.slice(line.indexOf(':') + 1).trim()
}

function readPartialStatus(value: unknown): LockInReviewStatus | null {
	const text = readGeneratedText(value)
	const start = text.indexOf('{')
	const end = text.lastIndexOf('}')
	if (start >= 0 && end >= start) {
		try {
			const candidate: unknown = JSON.parse(text.slice(start, end + 1))
			const result = lockInReviewStatusSchema.safeParse(
				candidate && hasObjectType(candidate) ? readProperty(candidate, 'status') : null
			)
			if (result.success) return result.data
		} catch {
			// Tagged output is checked below.
		}
	}
	const tagged = matchTaggedField(text, 'STATUS')
	const result = lockInReviewStatusSchema.safeParse(tagged?.toLowerCase())
	return result.success ? result.data : null
}

function createSafeLockInFallback(
	status: LockInReviewStatus,
	review: LockInReviewRequest,
	reviewedAt: Date
): LockInReviewResponse {
	const safeStatus = status === 'complete' ? 'unclear' : status
	const headline: Record<LockInReviewStatus, string> = {
		'on-track': 'Keep this direction',
		drifting: 'Return to your finish line',
		stalled: 'Restart with one visible step',
		unclear: 'Make your next step visible',
		complete: 'Goal complete',
	}
	const coach = safeStatus === 'drifting'
		? `Return to “${review.goal}” and complete the next visible step toward your finish line.`
		: `Complete the next visible step toward “${review.finishLine}”.`
	return {
		coach,
		evidence: 'The visual check completed, but the model did not return a complete explanation.',
		headline: headline[safeStatus],
		reviewedAt: reviewedAt.toISOString(),
		status: safeStatus,
	}
}

function toDataURL(image: LockInReviewRequest['canvasImage']) {
	return `data:${image.mediaType};base64,${image.data}`
}

function formatElapsedMinutes(value: number) {
	if (value < 1) return 'less than a minute'
	const rounded = Math.round(value)
	return `${rounded} minute${rounded === 1 ? '' : 's'}`
}

function readGeneratedText(value: unknown) {
	if (!value || !hasObjectType(value)) return ''
	for (const key of ['response', 'result', 'text']) {
		const candidate = readProperty(value, key)
		if (isString(candidate)) return candidate
	}
	return ''
}
