import {
	studyArtifactKindSchema,
	type GlobalSearchResult,
} from '@agentboard/shared'
import { and, eq, inArray, isNull, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDocumentAIConfig } from '../config'
import type { Database } from '../db/client'
import { board, boardMember, studyArtifact } from '../db/schema'
import type { AIRunner } from '../observability/posthogAI'

const MAX_RESULTS = 20
const MAX_FILTER_SPACES = 100
const vectorMatchSchema = z.object({
	metadata: z.looseObject({}),
	score: z.number().optional(),
})
const vectorMetadataBaseSchema = z.object({
	boardId: z.string(),
	chunkText: z.string(),
})
const lectureMetadataSchema = vectorMetadataBaseSchema.extend({
	lectureId: z.string(),
	lectureTitle: z.string(),
	resultKind: z.literal('lecture'),
	startSecond: z.number(),
})
const shapeMetadataSchema = vectorMetadataBaseSchema.extend({
	artifactKind: studyArtifactKindSchema,
	resultKind: z.literal('shape'),
	shapeId: z.string(),
	title: z.string(),
})
const documentMetadataSchema = vectorMetadataBaseSchema.extend({
	documentId: z.string(),
	documentTitle: z.string(),
	pageNumber: z.number(),
	resultKind: z.literal('document').optional(),
})
const vectorMetadataSchema = z.union([
	lectureMetadataSchema,
	shapeMetadataSchema,
	documentMetadataSchema,
])
const embeddingResponseSchema = z.object({ data: z.array(z.array(z.number())) })

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
			: result.kind === 'lecture-segment'
				? `lecture:${result.boardID}:${result.lectureID}:${Math.floor(result.startSecond)}`
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
	// SAFETY: Env.AI implements this JSON-returning subset through Cloudflare's model overloads.
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
		const parsed = vectorMatchSchema.safeParse(match)
		if (!parsed.success) return []
		const metadata = vectorMetadataSchema.safeParse(parsed.data.metadata)
		if (!metadata.success) return []
		const { data } = metadata
		const boardTitle = boardTitles.get(data.boardId)
		if (!boardTitle) return []
		const score = parsed.data.score ?? 0
		if (data.resultKind === 'lecture') {
			return [{
				boardID: data.boardId,
				boardTitle,
				kind: 'lecture-segment',
				lectureID: data.lectureId,
				score,
				snippet: data.chunkText.slice(0, 260),
				startSecond: data.startSecond,
				title: data.lectureTitle,
			}]
		}
		if (data.resultKind === 'shape') {
			return [{
				artifactKind: data.artifactKind,
				boardID: data.boardId,
				boardTitle,
				kind: 'shape',
				score,
				shapeID: data.shapeId,
				snippet: data.chunkText.slice(0, 260),
				title: data.title,
			}]
		}
		return [{
			boardID: data.boardId,
			boardTitle,
			documentID: data.documentId,
			kind: 'document-page',
			pageNumber: data.pageNumber,
			score,
			snippet: data.chunkText.slice(0, 260),
			title: data.documentTitle,
		}]
	})
}

function readFirstEmbedding<Value>(value: Value) {
	const parsed = embeddingResponseSchema.safeParse(value)
	const first = parsed.success ? parsed.data.data[0] : undefined
	if (!first) {
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
