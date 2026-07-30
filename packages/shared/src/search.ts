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

export type GlobalSearchResult = GlobalSearchDocumentResult | GlobalSearchShapeResult
