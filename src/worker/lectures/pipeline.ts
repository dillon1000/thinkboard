import type { LectureSegment } from '@agentboard/shared'
import { z } from 'zod'
import { getDocumentAIConfig } from '../config'
import { createDatabase } from '../db/client'
import {
	completeLecture,
	failLecture,
	getLectureRow,
	listLectureVectorIDs,
	replaceLectureChunks,
} from '../db/lectures'
import {
	observeAIRunner,
	type AIRunner,
} from '../observability/posthogAI'

const TRANSCRIPTION_MODEL = '@cf/openai/whisper-large-v3-turbo'
const EMBEDDING_BATCH_SIZE = 50
const MAX_TRANSCRIPT_CHARACTERS = 600_000
const CHUNK_TARGET_CHARACTERS = 1_800

const transcriptionEnvelopeSchema = z.looseObject({})
const transcriptionSegmentSchema = z.object({
	end: z.number(),
	start: z.number(),
	text: z.string(),
}).refine(({ end, start }) => end >= start)
const transcriptionWordSchema = z.object({
	end: z.number(),
	start: z.number(),
	word: z.string(),
})
const transcriptionInfoSchema = z.object({
	duration: z.number().nonnegative(),
})
const embeddingResponseSchema = z.object({
	data: z.array(z.array(z.number())),
})

interface TranscriptChunk {
	endSecond: number
	startSecond: number
	text: string
	vectorID: string
}

/**
 * Transcribes one stored lecture and publishes timestamped chunks to the shared retrieval index.
 * A failure leaves the original audio intact and marks the row for a clear retry or delete action.
 */
export async function processLecture(
	env: Env,
	boardID: string,
	lectureID: string,
	ctx?: ExecutionContext
) {
	const database = createDatabase(env)
	const row = await getLectureRow(database, boardID, lectureID)
	if (!row) return
	try {
		const object = await env.TLDRAW_BUCKET.get(row.r2Key)
		if (!object) throw new Error('Stored lecture audio is missing')
		const bytes = await object.arrayBuffer()
		const config = getDocumentAIConfig(env)
		// SAFETY: Env.AI supplies this JSON-returning runner through model-specific overloads; the
		// observer keeps the same call arguments and result while adding capture side effects.
		const ai = observeAIRunner(env.AI as AIRunner, env, {
			defer: (capture) => {
				if (ctx) ctx.waitUntil(capture)
				else void capture
			},
			distinctID: row.ownerID,
			properties: {
				board_id: boardID,
				lecture_id: lectureID,
				surface: 'lecture-ingestion',
			},
			provider: 'cloudflare',
			sessionID: lectureID,
			spanName: 'lecture-transcription',
			traceID: crypto.randomUUID(),
		})
		const transcriptionResponse = await ai.run(
			TRANSCRIPTION_MODEL,
			{
				audio: arrayBufferToBase64(bytes),
				condition_on_previous_text: true,
				initial_prompt: `Recorded lecture titled "${row.title}".`,
				task: 'transcribe',
				vad_filter: true,
			},
			{
				gateway: {
					id: config.gatewayID,
					metadata: { boardID, lectureID, pipeline: 'lecture-transcription' },
				},
			}
		)
		const transcription = parseLectureTranscription(transcriptionResponse)
		const chunks = buildTranscriptChunks(lectureID, transcription.segments)
		if (!chunks.length) throw new Error('The lecture did not contain transcribable speech')

		const existingVectorIDs = await listLectureVectorIDs(database, lectureID)
		if (existingVectorIDs.length) await env.DOCUMENT_VECTORS.deleteByIds(existingVectorIDs)
		await replaceLectureChunks(database, lectureID, chunks)
		for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
			const batch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE)
			const embeddingResponse = await ai.run(
				config.embeddingModel,
				{ text: batch.map(({ text }) => text) },
				{
					gateway: {
						id: config.gatewayID,
						metadata: { boardID, lectureID, pipeline: 'lecture-embedding' },
					},
				}
			)
			const embeddings = readEmbeddings(embeddingResponse)
			if (embeddings.length !== batch.length) {
				throw new Error('Lecture embedding response size did not match the request')
			}
			await env.DOCUMENT_VECTORS.upsert(batch.map((chunk, index) => ({
				id: chunk.vectorID,
				metadata: {
					boardId: boardID,
					chunkText: chunk.text.slice(0, 4_000),
					endSecond: chunk.endSecond,
					lectureId: lectureID,
					lectureTitle: row.title,
					resultKind: 'lecture',
					startSecond: chunk.startSecond,
				},
				values: embeddings[index],
			})))
		}
		// A user can delete a lecture while transcription runs. Remove vectors that
		// finished after the delete transaction, so private source text cannot remain.
		if (!(await getLectureRow(database, boardID, lectureID))) {
			await env.DOCUMENT_VECTORS.deleteByIds(chunks.map(({ vectorID }) => vectorID))
			return
		}
		await completeLecture(database, boardID, lectureID, transcription)
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'Unknown lecture processing error'
		await failLecture(database, boardID, lectureID, reason)
		throw error
	}
}

export function parseLectureTranscription<Value>(value: Value) {
	const parsed = transcriptionEnvelopeSchema.safeParse(value)
	if (!parsed.success) throw new Error('Transcription response was invalid')
	const textValue = z.string().safeParse(parsed.data.text)
	const text = textValue.success
		? textValue.data.trim().slice(0, MAX_TRANSCRIPT_CHARACTERS)
		: ''
	const segments = parseSegments(parsed.data.segments)
	const duration = readDuration(parsed.data.transcription_info) ??
		segments.at(-1)?.end ??
		null
	if (segments.length) {
		return {
			durationSeconds: duration,
			segments,
			transcript: text || segments.map((segment) => segment.text).join(' '),
		}
	}
	const wordSegments = groupWords(parsed.data.words)
	if (wordSegments.length) {
		return {
			durationSeconds: duration ?? wordSegments.at(-1)?.end ?? null,
			segments: wordSegments,
			transcript: text || wordSegments.map((segment) => segment.text).join(' '),
		}
	}
	if (!text) throw new Error('Transcription response did not contain text')
	return {
		durationSeconds: duration,
		segments: [{ end: duration ?? 0, start: 0, text }],
		transcript: text,
	}
}

export function buildTranscriptChunks(
	lectureID: string,
	segments: readonly LectureSegment[]
): TranscriptChunk[] {
	const chunks: TranscriptChunk[] = []
	let current: LectureSegment[] = []
	let characterCount = 0
	const flush = () => {
		if (!current.length) return
		const index = chunks.length
		chunks.push({
			endSecond: current.at(-1)?.end ?? current[0].end,
			startSecond: current[0].start,
			text: current.map(({ text }) => text).join(' '),
			vectorID: `lecture:${lectureID}:${index}`,
		})
		current = []
		characterCount = 0
	}
	for (const segment of segments) {
		if (current.length && characterCount + segment.text.length > CHUNK_TARGET_CHARACTERS) {
			flush()
		}
		current.push(segment)
		characterCount += segment.text.length + 1
	}
	flush()
	return chunks
}

function parseSegments<Value>(value: Value): LectureSegment[] {
	if (!Array.isArray(value)) return []
	return value.flatMap((entry): LectureSegment[] => {
		const segment = transcriptionSegmentSchema.safeParse(entry)
		if (!segment.success || !segment.data.text.trim()) return []
		return [{
			end: segment.data.end,
			start: segment.data.start,
			text: segment.data.text.trim().slice(0, 4_000),
		}]
	})
}

function groupWords<Value>(value: Value): LectureSegment[] {
	if (!Array.isArray(value)) return []
	const words = value.flatMap((entry) => {
		const word = transcriptionWordSchema.safeParse(entry)
		if (!word.success) return []
		return [{
			end: word.data.end,
			start: word.data.start,
			word: word.data.word.trim(),
		}]
	})
	const groups: LectureSegment[] = []
	for (let offset = 0; offset < words.length; offset += 30) {
		const group = words.slice(offset, offset + 30)
		const text = group.map(({ word }) => word).join(' ').trim()
		if (text) groups.push({
			end: group.at(-1)?.end ?? group[0].end,
			start: group[0].start,
			text,
		})
	}
	return groups
}

function readDuration<Value>(value: Value) {
	const parsed = transcriptionInfoSchema.safeParse(value)
	return parsed.success ? parsed.data.duration : null
}

function readEmbeddings<Value>(value: Value): number[][] {
	const parsed = embeddingResponseSchema.safeParse(value)
	if (!parsed.success) throw new Error('Embedding response did not contain vectors')
	return parsed.data.data
}

function arrayBufferToBase64(value: ArrayBuffer) {
	const bytes = new Uint8Array(value)
	let binary = ''
	for (let offset = 0; offset < bytes.length; offset += 32_768) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
	}
	return btoa(binary)
}
