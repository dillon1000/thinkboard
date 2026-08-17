import { z } from 'zod'
import { studyArtifactKindSchema } from './exams'

export const globalSearchQuerySchema = z.string().trim().min(2).max(300)

export interface GlobalSearchDocumentResult {
	boardID: string
	boardTitle: string
	documentID: string
	kind: 'document-page'
	pageNumber: number
	score: number
	snippet: string
	title: string
}

export interface GlobalSearchShapeResult {
	artifactKind: z.infer<typeof studyArtifactKindSchema>
	boardID: string
	boardTitle: string
	kind: 'shape'
	score: number
	shapeID: string
	snippet: string
	title: string
}

export interface GlobalSearchLectureResult {
	boardID: string
	boardTitle: string
	kind: 'lecture-segment'
	lectureID: string
	score: number
	snippet: string
	startSecond: number
	title: string
}

export type GlobalSearchResult =
	| GlobalSearchDocumentResult
	| GlobalSearchLectureResult
	| GlobalSearchShapeResult

export const globalSearchResultSchema: z.ZodType<GlobalSearchResult> = z.discriminatedUnion('kind', [
	z.object({
		boardID: z.string(), boardTitle: z.string(), documentID: z.string(),
		kind: z.literal('document-page'), pageNumber: z.number(), score: z.number(),
		snippet: z.string(), title: z.string(),
	}),
	z.object({
		boardID: z.string(), boardTitle: z.string(), kind: z.literal('lecture-segment'),
		lectureID: z.string(), score: z.number(), snippet: z.string(),
		startSecond: z.number(), title: z.string(),
	}),
	z.object({
		artifactKind: studyArtifactKindSchema, boardID: z.string(), boardTitle: z.string(),
		kind: z.literal('shape'), score: z.number(), shapeID: z.string(),
		snippet: z.string(), title: z.string(),
	}),
])
