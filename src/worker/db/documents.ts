import type {
	CanvasPDFPageRegion,
	DocumentPageSummary,
	DocumentStatus,
	DocumentSummary,
} from '@agentboard/shared'
import { pdfTextLayoutSchema } from '@agentboard/shared'
import { and, asc, count, desc, eq, gte, sql, sum } from 'drizzle-orm'
import type { Database } from './client'
import { document, documentChunk, documentPage, documentProcessingUsage } from './schema'

const D1_MAX_BOUND_PARAMETERS = 100
const DOCUMENT_CHUNK_PARAMETERS_PER_ROW = 3
const DOCUMENT_CHUNK_INSERT_BATCH_SIZE = Math.floor(
	D1_MAX_BOUND_PARAMETERS / DOCUMENT_CHUNK_PARAMETERS_PER_ROW
)

export async function createDocument(
	database: Database,
	input: {
		boardID: string
		byteSize: number
		id: string
		ownerID: string
		pageCount: number
		r2Key: string
		title: string
	}
) {
	const now = new Date()
	await database.batch([
		database.insert(document).values({
			...input,
			createdAt: now,
			updatedAt: now,
			status: 'processing',
		}),
		database.insert(documentProcessingUsage).values({
			createdAt: now,
			importID: input.id,
			ownerID: input.ownerID,
			pageCount: input.pageCount,
		}),
	])
}

export async function getDocumentRow(database: Database, boardID: string, documentID: string) {
	const [row] = await database
		.select()
		.from(document)
		.where(and(eq(document.id, documentID), eq(document.boardID, boardID)))
		.limit(1)
	return row ?? null
}

export async function listDocumentRows(database: Database, boardID: string) {
	return database
		.select()
		.from(document)
		.where(eq(document.boardID, boardID))
		.orderBy(desc(document.createdAt))
}

export async function listDocumentPageRows(database: Database, documentID: string) {
	return database
		.select()
		.from(documentPage)
		.where(eq(documentPage.documentID, documentID))
		.orderBy(asc(documentPage.pageNumber))
}

export async function getDocumentPageRow(
	database: Database,
	documentID: string,
	pageNumber: number
) {
	const [row] = await database
		.select()
		.from(documentPage)
		.where(
			and(
				eq(documentPage.documentID, documentID),
				eq(documentPage.pageNumber, pageNumber)
			)
		)
		.limit(1)
	return row ?? null
}

export async function upsertDocumentPage(
	database: Database,
	input: {
		documentID: string
		extractedText: string
		textLayout: string
		height: number
		imageR2Key: string
		pageNumber: number
		width: number
	}
) {
	await database
		.insert(documentPage)
		.values({ ...input, ocrApplied: false })
		.onConflictDoUpdate({
			target: [documentPage.documentID, documentPage.pageNumber],
			set: {
				extractedText: input.extractedText,
				textLayout: input.textLayout,
				height: input.height,
				imageR2Key: input.imageR2Key,
				ocrApplied: false,
				width: input.width,
			},
		})
	await database
		.update(document)
		.set({ failureReason: null, status: 'processing', updatedAt: new Date() })
		.where(eq(document.id, input.documentID))
}

export async function setDocumentStatus(
	database: Database,
	documentID: string,
	status: DocumentStatus,
	failureReason: string | null = null
) {
	await database
		.update(document)
		.set({ failureReason, status, updatedAt: new Date() })
		.where(eq(document.id, documentID))
}

export async function updateDocumentPageText(
	database: Database,
	documentID: string,
	pageNumber: number,
	extractedText: string,
	ocrApplied: boolean
) {
	await database
		.update(documentPage)
		.set({ extractedText, ocrApplied })
		.where(
			and(
				eq(documentPage.documentID, documentID),
				eq(documentPage.pageNumber, pageNumber)
			)
		)
}

export async function getUserDocumentUsage(
	database: Database,
	ownerID: string,
	dayStartedAt: Date
) {
	const [[stored], [daily]] = await Promise.all([
		database
			.select({ bytes: sum(document.byteSize) })
			.from(document)
			.where(eq(document.ownerID, ownerID)),
		database
			.select({ pages: sum(documentProcessingUsage.pageCount) })
			.from(documentProcessingUsage)
			.where(and(
				eq(documentProcessingUsage.ownerID, ownerID),
				gte(documentProcessingUsage.createdAt, dayStartedAt)
			)),
	])
	return {
		dailyPages: Number(daily?.pages ?? 0),
		storedBytes: Number(stored?.bytes ?? 0),
	}
}

export async function countUploadedDocumentPages(database: Database, documentID: string) {
	const [row] = await database
		.select({ value: count(documentPage.documentID) })
		.from(documentPage)
		.where(eq(documentPage.documentID, documentID))
	return row?.value ?? 0
}

export async function replaceDocumentChunks(
	database: Database,
	documentID: string,
	chunks: Array<{ pageNumber: number; vectorID: string }>
) {
	await database.delete(documentChunk).where(eq(documentChunk.documentID, documentID))
	for (let offset = 0; offset < chunks.length; offset += DOCUMENT_CHUNK_INSERT_BATCH_SIZE) {
		await database.insert(documentChunk).values(
			chunks
				.slice(offset, offset + DOCUMENT_CHUNK_INSERT_BATCH_SIZE)
				.map((chunk) => ({ ...chunk, documentID }))
		)
	}
}

export async function listDocumentVectorIDs(database: Database, documentID: string) {
	const rows = await database
		.select({ vectorID: documentChunk.vectorID })
		.from(documentChunk)
		.where(eq(documentChunk.documentID, documentID))
	return rows.map(({ vectorID }) => vectorID)
}

export async function deleteDocumentRow(database: Database, documentID: string) {
	await database.delete(document).where(eq(document.id, documentID))
}

export function toDocumentSummary(
	row: typeof document.$inferSelect,
	uploadedPageCount: number
): DocumentSummary {
	return {
		byteSize: row.byteSize,
		createdAt: row.createdAt.toISOString(),
		failureReason: row.failureReason,
		id: row.id,
		ownerID: row.ownerID,
		pageCount: row.pageCount,
		status: row.status,
		title: row.title,
		uploadedPageCount,
	}
}

export function toDocumentPageSummary(
	row: typeof documentPage.$inferSelect
): DocumentPageSummary {
	return {
		documentID: row.documentID,
		height: row.height,
		ocrApplied: row.ocrApplied,
		pageNumber: row.pageNumber,
		width: row.width,
	}
}

export async function listBoardReadyDocumentText(database: Database, boardID: string) {
	return database
		.select({
			documentID: document.id,
			documentTitle: document.title,
			pageNumber: documentPage.pageNumber,
			text: documentPage.extractedText,
			textLayout: documentPage.textLayout,
		})
		.from(documentPage)
		.innerJoin(document, eq(document.id, documentPage.documentID))
		.where(and(eq(document.boardID, boardID), eq(document.status, 'ready')))
		.orderBy(asc(documentPage.pageNumber))
}

export async function getSelectedDocumentText(
	database: Database,
	boardID: string,
	regions: readonly CanvasPDFPageRegion[]
) {
	const uniqueReferences = [...new Map(
		regions.map((region) => [`${region.documentID}:${region.pageNumber}`, region])
	).values()]
	const rows = await getPageTextForDocuments(database, boardID, uniqueReferences)
	return rows.flatMap((row) => {
		const matchingRegions = regions.filter((region) =>
			region.documentID === row.documentID && region.pageNumber === row.pageNumber
		)
		const layout = pdfTextLayoutSchema.safeParse(parseJSON(row.textLayout))
		const selectedText = layout.success && layout.data.length
			? layout.data
				.filter((block) => matchingRegions.some(({ region }) => normalizedRectsIntersect(block, region)))
				.map(({ text }) => text)
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim()
			: row.text.trim()
		return selectedText ? [{
			documentID: row.documentID,
			documentTitle: row.documentTitle,
			pageNumber: row.pageNumber,
			text: selectedText.slice(0, 8_000),
		}] : []
	})
}

function parseJSON(value: string): unknown {
	try {
		return JSON.parse(value)
	} catch {
		return null
	}
}

function normalizedRectsIntersect(
	a: { h: number; w: number; x: number; y: number },
	b: { h: number; w: number; x: number; y: number }
) {
	const margin = 0.015
	return a.x <= b.x + b.w + margin &&
		a.x + a.w + margin >= b.x &&
		a.y <= b.y + b.h + margin &&
		a.y + a.h + margin >= b.y
}

export async function getPageTextForDocuments(
	database: Database,
	boardID: string,
	references: Array<{ documentID: string; pageNumber: number }>
) {
	if (!references.length) return []
	const conditions = references.map(({ documentID, pageNumber }) =>
		and(eq(documentPage.documentID, documentID), eq(documentPage.pageNumber, pageNumber))
	)
	return database
		.select({
			documentID: document.id,
			documentTitle: document.title,
			pageNumber: documentPage.pageNumber,
			text: documentPage.extractedText,
			textLayout: documentPage.textLayout,
		})
		.from(documentPage)
		.innerJoin(document, eq(document.id, documentPage.documentID))
		.where(and(eq(document.boardID, boardID), sql`(${sql.join(conditions, sql` OR `)})`))
}
