import { describe, expect, it } from 'vitest'
import {
	buildTranscriptChunks,
	parseLectureTranscription,
} from './pipeline'

describe('parseLectureTranscription', () => {
	it('keeps timestamped segments and duration metadata', () => {
		expect(parseLectureTranscription({
			segments: [
				{ end: 3.5, start: 0.2, text: ' First idea. ' },
				{ end: 7, start: 3.5, text: 'Second idea.' },
			],
			text: 'First idea. Second idea.',
			transcription_info: { duration: 8.25 },
		})).toEqual({
			durationSeconds: 8.25,
			segments: [
				{ end: 3.5, start: 0.2, text: 'First idea.' },
				{ end: 7, start: 3.5, text: 'Second idea.' },
			],
			transcript: 'First idea. Second idea.',
		})
	})

	it('falls back to word timestamps when segments are absent', () => {
		const result = parseLectureTranscription({
			text: 'one two',
			words: [
				{ end: 0.5, start: 0, word: 'one' },
				{ end: 1, start: 0.5, word: 'two' },
			],
		})

		expect(result.segments).toEqual([{ end: 1, start: 0, text: 'one two' }])
	})
})

describe('buildTranscriptChunks', () => {
	it('keeps the time range and stable vector ID for each chunk', () => {
		const chunks = buildTranscriptChunks('lecture-1', [
			{ end: 2, start: 0, text: 'A'.repeat(1_500) },
			{ end: 5, start: 2, text: 'B'.repeat(1_500) },
		])

		expect(chunks).toHaveLength(2)
		expect(chunks[0]).toMatchObject({
			endSecond: 2,
			startSecond: 0,
			vectorID: 'lecture:lecture-1:0',
		})
		expect(chunks[1]).toMatchObject({
			endSecond: 5,
			startSecond: 2,
			vectorID: 'lecture:lecture-1:1',
		})
	})
})
