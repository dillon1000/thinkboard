import type { ModelMessage, UserModelMessage } from 'ai'
import { getDocumentAIConfig } from '../config'
import type { Database } from '../db/client'
import { isBoardActive } from '../db/boards'

const MAX_RETRIEVAL_RESULTS = 6

interface AIRunner {
	run(model: string, input: unknown, options?: unknown): Promise<unknown>
}

interface VectorQueryOptions {
	filter: { boardId: string }
	returnMetadata: 'all'
	topK: number
}

type VectorQuery = (vector: number[], options: VectorQueryOptions) => Promise<unknown>

export interface DocumentRetrievalResult {
	chunkText: string
	documentID: string
	documentTitle: string
	pageNumber: number
	score: number
}

export async function retrieveBoardDocuments(
	env: Env,
	database: Database,
	boardID: string,
	queryText: string
) {
	if (!queryText.trim() || !(await isBoardActive(database, boardID))) return []
	const config = getDocumentAIConfig(env)
	const response = await (env.AI as AIRunner).run(
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
	if (!response || typeof response !== 'object') return []
	const matches = Reflect.get(response, 'matches')
	if (!Array.isArray(matches)) return []
	return matches.flatMap((match): DocumentRetrievalResult[] => {
		if (!match || typeof match !== 'object') return []
		const metadata = Reflect.get(match, 'metadata')
		const score = Reflect.get(match, 'score')
		if (!metadata || typeof metadata !== 'object') return []
		const matchBoardID = Reflect.get(metadata, 'boardId')
		const chunkText = Reflect.get(metadata, 'chunkText')
		const documentID = Reflect.get(metadata, 'documentId')
		const documentTitle = Reflect.get(metadata, 'documentTitle')
		const pageNumber = Reflect.get(metadata, 'pageNumber')
		if (
			matchBoardID !== boardID ||
			typeof chunkText !== 'string' ||
			typeof documentID !== 'string' ||
			typeof documentTitle !== 'string' ||
			typeof pageNumber !== 'number'
		) return []
		return [{
			chunkText: chunkText.slice(0, 4_000),
			documentID,
			documentTitle,
			pageNumber,
			score: typeof score === 'number' ? score : 0,
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
	const content = typeof userMessage.content === 'string'
		? [{ type: 'text' as const, text: userMessage.content }]
		: userMessage.content
	const sources = results.map((result, index) => {
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

function readFirstEmbedding(value: unknown) {
	if (!value || typeof value !== 'object') throw new Error('Embedding response was invalid')
	const data = Reflect.get(value, 'data')
	const first = Array.isArray(data) ? data[0] : null
	if (!Array.isArray(first) || !first.every((entry) => typeof entry === 'number')) {
		throw new Error('Embedding response did not contain a vector')
	}
	return first
}
