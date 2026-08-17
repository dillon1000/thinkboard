import { z } from 'zod'

export const MAX_PDF_BYTES = 50 * 1_024 * 1_024
export const MAX_PDF_PAGES = 200
export const MAX_PDF_PAGE_IMAGE_BYTES = 12 * 1_024 * 1_024
export const MAX_OFFICE_BYTES = 50 * 1_024 * 1_024

export const documentStatusSchema = z.enum(['processing', 'ready', 'failed'])

export const documentSummarySchema = z.object({
	byteSize: z.number().nonnegative(),
	createdAt: z.string(),
	failureReason: z.string().nullable(),
	id: z.string(),
	ownerID: z.string(),
	pageCount: z.number().int().nonnegative(),
	status: documentStatusSchema,
	title: z.string(),
	uploadedPageCount: z.number().int().nonnegative(),
})

export const documentPageSummarySchema = z.object({
	documentID: z.string(),
	height: z.number().nonnegative(),
	ocrApplied: z.boolean(),
	pageNumber: z.number().int().positive(),
	width: z.number().nonnegative(),
})

export const documentStatusResponseSchema = z.object({
	document: documentSummarySchema,
	pages: z.array(documentPageSummarySchema),
})

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

export type DocumentSummary = z.infer<typeof documentSummarySchema>
export type DocumentPageSummary = z.infer<typeof documentPageSummarySchema>
export type DocumentStatusResponse = z.infer<typeof documentStatusResponseSchema>

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
