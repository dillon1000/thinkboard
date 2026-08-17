import { hasObjectType, isNumber, isString } from '@agentboard/shared'
import type { ModelMessage, UserModelMessage } from 'ai'
import { getDocumentAIConfig } from '../config'
import type { Database } from '../db/client'
import { isBoardActive } from '../db/boards'
import {
	observeAIRunner,
	type AIRunner,
} from '../observability/posthogAI'

const MAX_RETRIEVAL_RESULTS = 6

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

type VectorQuery = (vector: number[], options: VectorQueryOptions) => Promise<unknown>

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
	if (!response || !hasObjectType(response)) return []
	const matches = Reflect.get(response, 'matches')
	if (!Array.isArray(matches)) return []
	return matches.flatMap((match): DocumentRetrievalResult[] => {
		if (!match || !hasObjectType(match)) return []
		const metadata = Reflect.get(match, 'metadata')
		const score = Reflect.get(match, 'score')
		if (!metadata || !hasObjectType(metadata)) return []
		const matchBoardID = Reflect.get(metadata, 'boardId')
		const chunkText = Reflect.get(metadata, 'chunkText')
		const resultKind = Reflect.get(metadata, 'resultKind')
		if (matchBoardID !== boardID || !isString(chunkText)) return []
		if (resultKind === 'lecture') {
			const lectureID = Reflect.get(metadata, 'lectureId')
			const lectureTitle = Reflect.get(metadata, 'lectureTitle')
			const startSecond = Reflect.get(metadata, 'startSecond')
			const endSecond = Reflect.get(metadata, 'endSecond')
			if (
				!isString(lectureID) ||
				!isString(lectureTitle) ||
				!isNumber(startSecond) ||
				!isNumber(endSecond)
			) return []
			return [{
				chunkText: chunkText.slice(0, 4_000),
				endSecond,
				lectureID,
				lectureTitle,
				score: isNumber(score) ? score : 0,
				sourceKind: 'lecture',
				startSecond,
			}]
		}
		const documentID = Reflect.get(metadata, 'documentId')
		const documentTitle = Reflect.get(metadata, 'documentTitle')
		const pageNumber = Reflect.get(metadata, 'pageNumber')
		if (
			!isString(documentID) ||
			!isString(documentTitle) ||
			!isNumber(pageNumber)
		) return []
		return [{
			chunkText: chunkText.slice(0, 4_000),
			documentID,
			documentTitle,
			pageNumber,
			score: isNumber(score) ? score : 0,
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
	const userMessage = messages[userMessageIndex] as UserModelMessage
	const content = isString(userMessage.content)
		? [{ type: 'text' as const, text: userMessage.content }]
		: userMessage.content
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

function readFirstEmbedding(value: unknown) {
	if (!value || !hasObjectType(value)) throw new Error('Embedding response was invalid')
	const data = Reflect.get(value, 'data')
	const first = Array.isArray(data) ? data[0] : null
	if (!Array.isArray(first) || !first.every((entry) => isNumber(entry))) {
		throw new Error('Embedding response did not contain a vector')
	}
	return first
}
