import {
	studyArtifactKindSchema,
	type GlobalSearchResult,
} from '@agentboard/shared'
import { and, eq, inArray, isNull, like, or } from 'drizzle-orm'
import { getDocumentAIConfig } from '../config'
import type { Database } from '../db/client'
import { board, boardMember, studyArtifact } from '../db/schema'
import type { AIRunner } from '../observability/posthogAI'

const MAX_RESULTS = 20
const MAX_FILTER_SPACES = 100

/**
 * Searches all active spaces that the signed-in user can access. The Vectorize filter narrows
 * retrieval before ranking, and the parser repeats the membership check before returning a target.
 */
export async function searchWorkspace(
	database: Database,
	env: Env,
	userID: string,
	query: string
): Promise<GlobalSearchResult[]> {
	const boardRows = await database
		.select({ id: board.id, title: board.title })
		.from(boardMember)
		.innerJoin(board, eq(board.id, boardMember.boardID))
		.where(and(eq(boardMember.userID, userID), isNull(board.archivedAt)))
	if (!boardRows.length) return []

	const boardTitles = new Map(boardRows.map(({ id, title }) => [id, title]))
	const boardIDs = [...boardTitles.keys()]
	const [semantic, lexical] = await Promise.all([
		searchVectors(env, query, boardIDs, boardTitles),
		searchArtifactText(database, query, boardIDs, boardTitles),
	])
	const results = new Map<string, GlobalSearchResult>()
	for (const result of [...semantic, ...lexical]) {
		const key = result.kind === 'shape'
			? `shape:${result.boardID}:${result.shapeID}`
			: `page:${result.boardID}:${result.documentID}:${result.pageNumber}`
		const existing = results.get(key)
		if (!existing || existing.score < result.score) results.set(key, result)
	}
	return [...results.values()]
		.sort((left, right) => right.score - left.score)
		.slice(0, MAX_RESULTS)
}

async function searchVectors(
	env: Env,
	query: string,
	boardIDs: string[],
	boardTitles: ReadonlyMap<string, string>
) {
	const config = getDocumentAIConfig(env)
	const response = await (env.AI as AIRunner).run(
		config.embeddingModel,
		{ text: [query.slice(0, 8_000)] },
		{
			gateway: {
				id: config.gatewayID,
				metadata: { pipeline: 'workspace-search' },
			},
		}
	)
	const vector = readFirstEmbedding(response)
	const boardGroups = chunk(boardIDs, MAX_FILTER_SPACES)
	const responses = await Promise.all(boardGroups.map((group) =>
		env.DOCUMENT_VECTORS.query(vector, {
			filter: { boardId: { $in: group } },
			returnMetadata: 'all',
			topK: MAX_RESULTS,
		})
	))
	return responses.flatMap((value) => parseGlobalSearchMatches(value, boardTitles))
}

async function searchArtifactText(
	database: Database,
	query: string,
	boardIDs: string[],
	boardTitles: ReadonlyMap<string, string>
): Promise<GlobalSearchResult[]> {
	const safeQuery = query.replaceAll('%', '').replaceAll('_', '').trim()
	if (!safeQuery) return []
	const rows = await database
		.select({
			boardID: studyArtifact.boardID,
			kind: studyArtifact.kind,
			shapeID: studyArtifact.shapeID,
			text: studyArtifact.text,
			title: studyArtifact.title,
		})
		.from(studyArtifact)
		.where(and(
			inArray(studyArtifact.boardID, boardIDs),
			or(
				like(studyArtifact.title, `%${safeQuery}%`),
				like(studyArtifact.text, `%${safeQuery}%`)
			)
		))
		.limit(12)
	return rows.flatMap((row): GlobalSearchResult[] => {
		const boardTitle = boardTitles.get(row.boardID)
		return boardTitle ? [{
			artifactKind: row.kind,
			boardID: row.boardID,
			boardTitle,
			kind: 'shape',
			score: 0.65,
			shapeID: row.shapeID,
			snippet: createSnippet(row.text, query),
			title: row.title,
		}] : []
	})
}

export function parseGlobalSearchMatches(
	value: VectorizeMatches,
	boardTitles: ReadonlyMap<string, string>
): GlobalSearchResult[] {
	return value.matches.flatMap((match): GlobalSearchResult[] => {
		const metadata = match.metadata
		if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
		const boardID = readString(metadata, 'boardId')
		const boardTitle = boardTitles.get(boardID)
		const text = readString(metadata, 'chunkText')
		if (!boardTitle || !text) return []
		const score = typeof match.score === 'number' ? match.score : 0
		if (readString(metadata, 'resultKind') === 'shape') {
			const kind = studyArtifactKindSchema.safeParse(readString(metadata, 'artifactKind'))
			const shapeID = readString(metadata, 'shapeId')
			const title = readString(metadata, 'title')
			if (!kind.success || !shapeID || !title) return []
			return [{
				artifactKind: kind.data,
				boardID,
				boardTitle,
				kind: 'shape',
				score,
				shapeID,
				snippet: text.slice(0, 260),
				title,
			}]
		}
		const documentID = readString(metadata, 'documentId')
		const title = readString(metadata, 'documentTitle')
		const pageNumber = Reflect.get(metadata, 'pageNumber')
		if (!documentID || !title || typeof pageNumber !== 'number') return []
		return [{
			boardID,
			boardTitle,
			documentID,
			kind: 'document-page',
			pageNumber,
			score,
			snippet: text.slice(0, 260),
			title,
		}]
	})
}

function readString(value: object, key: string) {
	const field = Reflect.get(value, key)
	return typeof field === 'string' ? field : ''
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

function createSnippet(text: string, query: string) {
	const match = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
	const start = Math.max(0, match < 0 ? 0 : match - 80)
	return text.slice(start, start + 260)
}

function chunk<T>(values: T[], size: number) {
	return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
		values.slice(index * size, (index + 1) * size)
	)
}
