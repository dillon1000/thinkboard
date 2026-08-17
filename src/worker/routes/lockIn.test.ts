import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { LockInReviewRequest } from '@agentboard/shared'
import {
	createLockInReviewMessages,
	generateLockInReview,
	parseLockInModelResponse,
} from './lockIn'

const request: LockInReviewRequest = {
	canvasImage: {
		data: 'Y2FudmFz',
		height: 720,
		mediaType: 'image/jpeg',
		width: 1_024,
	},
	changedShapeCount: 2,
	changesImage: {
		data: 'Y2hhbmdlcw==',
		height: 420,
		mediaType: 'image/jpeg',
		width: 640,
	},
	elapsedMinutes: 8,
	finishLine: 'A labeled graph and a complete explanation',
	goal: 'Explain price elasticity',
	intervalSeconds: 60,
	sessionID: 'session-1',
}

describe('Lock In AI review', () => {
	it('labels both canvas images and gives recent edits higher relevance', () => {
		const messages = createLockInReviewMessages(request)
		const content = messages[1].content
		expect(Array.isArray(content)).toBe(true)
		expect(content).toEqual(expect.arrayContaining([
			expect.objectContaining({
				image_url: { url: 'data:image/jpeg;base64,Y2FudmFz' },
				type: 'image_url',
			}),
			expect.objectContaining({
				image_url: { url: 'data:image/jpeg;base64,Y2hhbmdlcw==' },
				type: 'image_url',
			}),
		]))
		expect(JSON.stringify(content)).toContain('Weight this image most heavily')
	})

	it('normalizes guided model JSON with a server timestamp', () => {
		expect(parseLockInModelResponse({
			response: '```json\n{"status":"on-track","headline":"Good direction","coach":"Label the final axis next.","evidence":"The latest edits complete the demand curve."}\n```',
		}, new Date('2026-07-23T18:00:00.000Z'))).toEqual({
			coach: 'Label the final axis next.',
			evidence: 'The latest edits complete the demand curve.',
			headline: 'Good direction',
			reviewedAt: '2026-07-23T18:00:00.000Z',
			status: 'on-track',
		})
	})

	it('recovers missing coach fields with a targeted second pass', async () => {
		const responses = [
			{ response: '{"status":"on-track"}' },
			{ response: 'STATUS: on-track\nHEADLINE: Finish the graph\nCOACH: Label the horizontal axis next.\nEVIDENCE: The newest edits complete the curve but leave the axis unlabeled.' },
		]
		const inputs: Array<z.infer<ReturnType<typeof z.json>>> = []
		const ai = {
			run: <Input>(_model: string, input: Input) => {
				inputs.push(z.json().parse(input))
				return Promise.resolve(responses.shift())
			},
		}

		await expect(generateLockInReview(
			ai,
			'vision-model',
			request,
			undefined,
			new Date('2026-07-23T18:00:00.000Z')
		)).resolves.toEqual({
			coach: 'Label the horizontal axis next.',
			evidence: 'The newest edits complete the curve but leave the axis unlabeled.',
			headline: 'Finish the graph',
			reviewedAt: '2026-07-23T18:00:00.000Z',
			status: 'on-track',
		})
		expect(inputs).toHaveLength(2)
	})

	it('returns a safe verdict when both model responses are incomplete', async () => {
		const ai = {
			run: () => Promise.resolve({ response: '{"status":"drifting"}' }),
		}

		await expect(generateLockInReview(
			ai,
			'vision-model',
			request,
			undefined,
			new Date('2026-07-23T18:00:00.000Z')
		)).resolves.toMatchObject({
			headline: 'Return to your finish line',
			status: 'drifting',
		})
	})

	it('does not complete a session from a partial completion verdict', async () => {
		const ai = {
			run: () => Promise.resolve({ response: '{"status":"complete"}' }),
		}

		await expect(generateLockInReview(
			ai,
			'vision-model',
			request,
			undefined,
			new Date('2026-07-23T18:00:00.000Z')
		)).resolves.toMatchObject({
			headline: 'Make your next step visible',
			status: 'unclear',
		})
	})

	it('accepts a complete verdict when all visual evidence fields are present', () => {
		expect(parseLockInModelResponse({
			response: '{"status":"complete","headline":"Goal complete","coach":"You finished it.","evidence":"The labeled graph and explanation now satisfy the finish line."}',
		})).toMatchObject({
			headline: 'Goal complete',
			status: 'complete',
		})
	})
})
