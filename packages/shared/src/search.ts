import { z } from 'zod'
import { studyArtifactKindSchema } from './exams'

export const globalSearchQuerySchema = z.string().trim().min(2).max(300)

export const globalSearchResultSchema = z.discriminatedUnion('kind', [
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

export type GlobalSearchResult = z.infer<typeof globalSearchResultSchema>
export type GlobalSearchDocumentResult = Extract<GlobalSearchResult, { kind: 'document-page' }>
export type GlobalSearchLectureResult = Extract<GlobalSearchResult, { kind: 'lecture-segment' }>
export type GlobalSearchShapeResult = Extract<GlobalSearchResult, { kind: 'shape' }>
