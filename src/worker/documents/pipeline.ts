import type { DocumentStatus } from '@agentboard/shared'
import { z } from 'zod'
import { createDatabase } from '../db/client'
import {
	getDocumentRow,
	getUserDocumentUsage,
	listDocumentPageRows,
	listDocumentVectorIDs,
	replaceDocumentChunks,
	setDocumentStatus,
	updateDocumentPageText,
} from '../db/documents'
import { getDocumentAIConfig } from '../config'
import {
	observeAIRunner,
	type AIRunner,
} from '../observability/posthogAI'
import type { DocumentPipelineMessage } from './types'
import { processOfficeConversion } from './officeConversion'

const DEFAULT_DAILY_PDF_PAGE_QUOTA = 1_000
const MIN_USEFUL_TEXT_CHARACTERS = 40
const CHUNK_TARGET_CHARACTERS = 2_600
const CHUNK_MAX_CHARACTERS = 3_200
const EMBEDDING_BATCH_SIZE = 50
const embeddingResponseSchema = z.object({ data: z.array(z.array(z.number())) })
const generatedTextSchema = z.object({
	response: z.string().optional(),
	result: z.string().optional(),
	text: z.string().optional(),
})

interface PipelineChunk {
	pageNumber: number
	text: string
	vectorID: string
}

interface AIGatewayOptions {
	gateway: {
		id: string
		metadata: {
			boardID: string
			documentID: string
			pipeline: string
		}
	}
}

export async function processDocumentBatch(
	batch: MessageBatch<DocumentPipelineMessage>,
	env: Env,
	ctx?: ExecutionContext
) {
	for (const message of batch.messages) {
		try {
			if (message.body.kind === 'office-conversion') {
				await processOfficeConversion(message.body, env)
			} else {
				await processDocument(message.body, env, ctx)
			}
			message.ack()
		} catch (error) {
			const reason = getErrorMessage(error).slice(0, 500)
			console.error(JSON.stringify({
				documentID: message.body.documentID,
				error: reason,
				pipelineStage: message.body.kind === 'office-conversion'
					? 'office-conversion-failed'
					: 'failed',
			}))
			await setPipelineStatus(env, message.body, 'failed', reason)
			message.retry()
		}
	}
}

export async function processDocument(
	message: DocumentPipelineMessage,
	env: Env,
	ctx?: ExecutionContext
) {
	const startedAt = performance.now()
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, message.boardID, message.documentID)
	if (!documentRow) return

	const dailyQuota = readPositiveNumber(env.PDF_DAILY_PAGE_QUOTA, DEFAULT_DAILY_PDF_PAGE_QUOTA)
	const usage = await getUserDocumentUsage(database, message.ownerID, startOfUTCDay())
	if (usage.dailyPages > dailyQuota) {
		throw new Error('Daily PDF page processing quota exceeded')
	}

	await setDocumentStatus(database, documentRow.id, 'processing')
	const pages = await listDocumentPageRows(database, documentRow.id)
	if (pages.length !== documentRow.pageCount) throw new Error('Document import is incomplete')

	const aiConfig = getDocumentAIConfig(env)
	const gatewayOptions: AIGatewayOptions = {
		gateway: {
			id: aiConfig.gatewayID,
			metadata: {
				boardID: message.boardID,
				documentID: message.documentID,
				pipeline: 'pdf-import',
			},
		},
	}
	// SAFETY: Env.AI implements this JSON-returning subset through Cloudflare's model overloads.
	const ai = observeAIRunner(env.AI as AIRunner, env, {
		defer: (capture) => {
			if (ctx) ctx.waitUntil(capture)
			else void capture
		},
		distinctID: message.ownerID,
		properties: {
			board_id: message.boardID,
			document_id: message.documentID,
			surface: 'pdf-import',
		},
		provider: 'cloudflare',
		sessionID: message.documentID,
		spanName: 'pdf-import',
		traceID: crypto.randomUUID(),
	})
	const ocrStartedAt = performance.now()
	const pageTexts: Array<{ pageNumber: number; text: string }> = []
	let ocrPageCount = 0
	for (const page of pages) {
		let text = page.extractedText.trim()
		if (needsOCR(text)) {
			const image = await env.TLDRAW_BUCKET.get(page.imageR2Key)
			if (!image) throw new Error(`Rendered page ${page.pageNumber} is missing`)
			text = await extractPageTextWithOCR(
				ai,
				aiConfig.ocrModel,
				await image.arrayBuffer(),
				image.httpMetadata?.contentType ?? 'image/jpeg',
				gatewayOptions
			)
			ocrPageCount += 1
			await updateDocumentPageText(database, documentRow.id, page.pageNumber, text, true)
		}
		pageTexts.push({ pageNumber: page.pageNumber, text })
	}
	logStage(message, 'ocr', ocrStartedAt, { ocrPageCount })

	const chunks = pageTexts.flatMap(({ pageNumber, text }) =>
		chunkPageText(text).map((chunkText, index): PipelineChunk => ({
			pageNumber,
			text: chunkText,
			vectorID: `${documentRow.id}:${pageNumber}:${index}`,
		}))
	)
	const embeddingStartedAt = performance.now()
	const existingVectorIDs = await listDocumentVectorIDs(database, documentRow.id)
	if (existingVectorIDs.length) await env.DOCUMENT_VECTORS.deleteByIds(existingVectorIDs)
	await replaceDocumentChunks(
		database,
		documentRow.id,
		chunks.map(({ pageNumber, vectorID }) => ({ pageNumber, vectorID }))
	)

	for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
		const batch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE)
		const response = await ai.run(
			aiConfig.embeddingModel,
			{ text: batch.map(({ text }) => text) },
			gatewayOptions
		)
		const embeddings = readEmbeddings(response)
		if (embeddings.length !== batch.length) throw new Error('Embedding response size did not match the request')
		await env.DOCUMENT_VECTORS.upsert(batch.map((chunk, index) => ({
			id: chunk.vectorID,
			metadata: {
				boardId: documentRow.boardID,
				chunkText: chunk.text,
				documentId: documentRow.id,
				documentTitle: documentRow.title,
				pageNumber: chunk.pageNumber,
			},
			values: embeddings[index],
		})))
	}
	logStage(message, 'embedding', embeddingStartedAt, { chunkCount: chunks.length })
	await setDocumentStatus(database, documentRow.id, 'ready')
	logStage(message, 'complete', startedAt, { pageCount: documentRow.pageCount })
}

async function setPipelineStatus(
	env: Env,
	message: DocumentPipelineMessage,
	status: DocumentStatus,
	reason: string
) {
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, message.boardID, message.documentID)
	if (documentRow) await setDocumentStatus(database, documentRow.id, status, reason)
}

async function extractPageTextWithOCR(
	ai: AIRunner,
	model: string,
	bytes: ArrayBuffer,
	mediaType: string,
	gatewayOptions: AIGatewayOptions
) {
	const response = await ai.run(model, {
		image: `data:${mediaType};base64,${arrayBufferToBase64(bytes)}`,
		max_tokens: 4_096,
		messages: [
			{
				content: 'Transcribe all visible text on this document page in reading order. Preserve headings, lists, equations, labels, and table structure using plain text or Markdown. Return only the transcription.',
				role: 'user',
			},
		],
		temperature: 0,
	}, gatewayOptions)
	const text = readGeneratedText(response).trim()
	if (!text) throw new Error('OCR returned no text')
	return text.slice(0, 200_000)
}

export function chunkPageText(text: string) {
	const normalized = text.trim().replace(/\r\n?/g, '\n')
	if (!normalized) return []
	const paragraphs = normalized.split(/\n{2,}/).flatMap((paragraph) =>
		paragraph.length <= CHUNK_MAX_CHARACTERS
			? [paragraph]
			: splitLongText(paragraph, CHUNK_MAX_CHARACTERS)
	)
	const chunks: string[] = []
	let current = ''
	for (const paragraph of paragraphs) {
		const candidate = current ? `${current}\n\n${paragraph}` : paragraph
		if (candidate.length > CHUNK_MAX_CHARACTERS && current) {
			chunks.push(current)
			current = paragraph
		} else {
			current = candidate
		}
		if (current.length >= CHUNK_TARGET_CHARACTERS) {
			chunks.push(current)
			current = ''
		}
	}
	if (current) chunks.push(current)
	return chunks
}

function splitLongText(text: string, maximumLength: number) {
	const parts: string[] = []
	let remaining = text.trim()
	while (remaining.length > maximumLength) {
		const candidate = remaining.slice(0, maximumLength)
		const boundary = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf('. '), candidate.lastIndexOf(' '))
		const splitAt = boundary > maximumLength * 0.6 ? boundary + 1 : maximumLength
		parts.push(remaining.slice(0, splitAt).trim())
		remaining = remaining.slice(splitAt).trim()
	}
	if (remaining) parts.push(remaining)
	return parts
}

function needsOCR(text: string) {
	return text.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_USEFUL_TEXT_CHARACTERS
}

function readEmbeddings<Value>(value: Value): number[][] {
	const parsed = embeddingResponseSchema.safeParse(value)
	if (!parsed.success) throw new Error('Embedding response did not contain vectors')
	return parsed.data.data
}

function readGeneratedText<Value>(value: Value) {
	const parsed = generatedTextSchema.safeParse(value)
	return parsed.success
		? parsed.data.response ?? parsed.data.result ?? parsed.data.text ?? ''
		: ''
}

function arrayBufferToBase64(value: ArrayBuffer) {
	const bytes = new Uint8Array(value)
	let binary = ''
	for (let offset = 0; offset < bytes.length; offset += 32_768) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
	}
	return btoa(binary)
}

function logStage(
	message: DocumentPipelineMessage,
	pipelineStage: string,
	startedAt: number,
	details: Record<string, number>
) {
	console.info(JSON.stringify({
		boardID: message.boardID,
		documentID: message.documentID,
		durationMS: Math.round(performance.now() - startedAt),
		pipelineStage,
		...details,
	}))
}

function startOfUTCDay() {
	const now = new Date()
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function readPositiveNumber(value: string | undefined, fallback: number) {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getErrorMessage<Failure>(error: Failure) {
	return error instanceof Error ? error.message : 'Unknown document pipeline failure'
}
