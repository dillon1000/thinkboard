import { z } from 'zod'

export const MAX_PDF_BYTES = 50 * 1_024 * 1_024
export const MAX_PDF_PAGES = 200
export const MAX_PDF_PAGE_IMAGE_BYTES = 12 * 1_024 * 1_024
export const MAX_OFFICE_BYTES = 50 * 1_024 * 1_024

export const documentStatusSchema = z.enum(['processing', 'ready', 'failed'])

export const documentErrorCodeSchema = z.enum([
	'DOCUMENT_NOT_FOUND',
	'INVALID_PDF',
	'INVALID_OFFICE',
	'INVALID_PAGE',
	'OFFICE_TOO_LARGE',
	'PDF_TOO_LARGE',
	'PDF_TOO_MANY_PAGES',
	'PAGE_IMAGE_TOO_LARGE',
	'IMPORT_INCOMPLETE',
	'STORED_BYTES_QUOTA_EXCEEDED',
	'DAILY_PAGE_QUOTA_EXCEEDED',
	'PIPELINE_FAILED',
])

export interface DocumentSummary {
	byteSize: number
	createdAt: string
	failureReason: string | null
	id: string
	ownerID: string
	pageCount: number
	status: DocumentStatus
	title: string
	uploadedPageCount: number
}

export interface DocumentPageSummary {
	documentID: string
	height: number
	ocrApplied: boolean
	pageNumber: number
	width: number
}

export interface DocumentStatusResponse {
	document: DocumentSummary
	pages: DocumentPageSummary[]
}

export interface DocumentErrorResponse {
	code: DocumentErrorCode
	error: string
	limit?: number
}

export const pdfTextBlockSchema = z.object({
	h: z.number().finite().min(0).max(1),
	text: z.string().max(2_000),
	w: z.number().finite().min(0).max(1),
	x: z.number().finite().min(0).max(1),
	y: z.number().finite().min(0).max(1),
})

export const pdfTextLayoutSchema = z.array(pdfTextBlockSchema).max(5_000)

export type DocumentErrorCode = z.infer<typeof documentErrorCodeSchema>
export type DocumentStatus = z.infer<typeof documentStatusSchema>
export type PDFTextBlock = z.infer<typeof pdfTextBlockSchema>
