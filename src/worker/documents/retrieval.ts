import type { ModelMessage, UserModelMessage } from 'ai'
import { z } from 'zod'
import { getDocumentAIConfig } from '../config'
import type { Database } from '../db/client'
import { isBoardActive } from '../db/boards'
import {
	observeAIRunner,
	type AIRunner,
} from '../observability/posthogAI'

const MAX_RETRIEVAL_RESULTS = 6

const vectorMatchEnvelopeSchema = z.object({
	matches: z.array(z.looseObject({
		metadata: z.looseObject({}),
		score: z.number().optional(),
	})),
})
const lectureMetadataSchema = z.object({
	boardId: z.string(),
	chunkText: z.string(),
	endSecond: z.number(),
	lectureId: z.string(),
	lectureTitle: z.string(),
	resultKind: z.literal('lecture'),
	startSecond: z.number(),
})
const PDFMetadataSchema = z.object({
	boardId: z.string(),
	chunkText: z.string(),
	documentId: z.string(),
	documentTitle: z.string(),
	pageNumber: z.number(),
})
const embeddingResponseSchema = z.object({
	data: z.array(z.array(z.number())),
})

interface DocumentRetrievalTelemetry {
	defer: (capture: Promise<void>) => void
	distinctID: string
	sessionID?: string
	traceID: string
}

interface VectorQueryOptions {
	filter: { boardId: string }
	returnMetadata: 'all'
	topK: number
}

type VectorQueryResponse = VectorizeMatches | z.input<typeof vectorMatchEnvelopeSchema>
type VectorQuery = (vector: number[], options: VectorQueryOptions) => Promise<VectorQueryResponse>

export interface PDFRetrievalResult {
	chunkText: string
	documentID: string
	documentTitle: string
	pageNumber: number
	score: number
	sourceKind: 'pdf'
}

export interface LectureRetrievalResult {
	chunkText: string
	endSecond: number
	lectureID: string
	lectureTitle: string
	score: number
	sourceKind: 'lecture'
	startSecond: number
}

export type DocumentRetrievalResult = LectureRetrievalResult | PDFRetrievalResult

export async function retrieveBoardDocuments(
	env: Env,
	database: Database,
	boardID: string,
	queryText: string,
	telemetry?: DocumentRetrievalTelemetry
) {
	if (!queryText.trim() || !(await isBoardActive(database, boardID))) return []
	const config = getDocumentAIConfig(env)
	// SAFETY: Env.AI supplies the same model, input, options, and JSON result contract through
	// Cloudflare's model-specific overloads; this adapter erases only those overload names.
	const baseAI = env.AI as AIRunner
	const ai = telemetry
		? observeAIRunner(baseAI, env, {
				...telemetry,
				properties: { board_id: boardID, surface: 'pdf-retrieval' },
				provider: 'cloudflare',
				spanName: 'pdf-retrieval',
			})
		: baseAI
	const response = await ai.run(
		config.embeddingModel,
		{ text: [queryText.slice(0, 8_000)] },
		{
			gateway: {
				id: config.gatewayID,
				metadata: { boardID, pipeline: 'pdf-retrieval' },
			},
		}
	)
	const vector = readFirstEmbedding(response)
	return queryBoardDocumentVectors(
		(values, options) => env.DOCUMENT_VECTORS.query(values, options),
		vector,
		boardID
	)
}

export async function queryBoardDocumentVectors(
	query: VectorQuery,
	vector: number[],
	boardID: string
): Promise<DocumentRetrievalResult[]> {
	const response = await query(vector, {
		filter: { boardId: boardID },
		returnMetadata: 'all',
		topK: MAX_RETRIEVAL_RESULTS,
	})
	const parsed = vectorMatchEnvelopeSchema.safeParse(response)
	if (!parsed.success) return []
	return parsed.data.matches.flatMap((match): DocumentRetrievalResult[] => {
		const lecture = lectureMetadataSchema.safeParse(match.metadata)
		if (lecture.success) {
			if (lecture.data.boardId !== boardID) return []
			return [{
				chunkText: lecture.data.chunkText.slice(0, 4_000),
				endSecond: lecture.data.endSecond,
				lectureID: lecture.data.lectureId,
				lectureTitle: lecture.data.lectureTitle,
				score: match.score ?? 0,
				sourceKind: 'lecture',
				startSecond: lecture.data.startSecond,
			}]
		}
		const PDF = PDFMetadataSchema.safeParse(match.metadata)
		if (!PDF.success || PDF.data.boardId !== boardID) return []
		return [{
			chunkText: PDF.data.chunkText.slice(0, 4_000),
			documentID: PDF.data.documentId,
			documentTitle: PDF.data.documentTitle,
			pageNumber: PDF.data.pageNumber,
			score: match.score ?? 0,
			sourceKind: 'pdf',
		}]
	})
}

export function attachDocumentRetrieval(
	messages: ModelMessage[],
	results: readonly DocumentRetrievalResult[]
) {
	if (!results.length) return messages
	const userMessageIndex = messages.findLastIndex(({ role }) => role === 'user')
	if (userMessageIndex < 0) return messages
	const userMessage = messages[userMessageIndex]
	if (userMessage.role !== 'user') return messages
	const content: Exclude<UserModelMessage['content'], string> = Array.isArray(userMessage.content)
		? userMessage.content
		: [{ type: 'text', text: userMessage.content }]
	const sources = results.map((result, index) => {
		if (result.sourceKind === 'lecture') {
			const href = `#lecture=${encodeURIComponent(result.lectureID)}&t=${Math.floor(result.startSecond)}`
			return [
				`Source ${index + 1}: [${result.lectureTitle}, ${formatTimestamp(result.startSecond)}](${href})`,
				result.chunkText,
			].join('\n')
		}
		const href = `#pdf-page=${encodeURIComponent(result.documentID)}&page=${result.pageNumber}`
		return [
			`Source ${index + 1}: [${result.documentTitle}, page ${result.pageNumber}](${href})`,
			result.chunkText,
		].join('\n')
	}).join('\n\n')
	const nextMessages = [...messages]
	nextMessages[userMessageIndex] = {
		...userMessage,
		content: [...content, {
			type: 'text' as const,
			text: `Authorized document retrieval for this board only:\n<document-retrieval>\n${sources}\n</document-retrieval>`,
		}],
	}
	return nextMessages
}

function formatTimestamp(value: number) {
	const seconds = Math.max(0, Math.floor(value))
	const minutes = Math.floor(seconds / 60)
	return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function readFirstEmbedding<Value>(value: Value) {
	const parsed = embeddingResponseSchema.safeParse(value)
	const first = parsed.success ? parsed.data.data[0] : undefined
	if (!first) {
		throw new Error('Embedding response did not contain a vector')
	}
	return first
}
