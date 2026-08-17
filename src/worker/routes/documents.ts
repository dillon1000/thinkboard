import {
	MAX_OFFICE_BYTES,
	MAX_PDF_BYTES,
	MAX_PDF_PAGE_IMAGE_BYTES,
	MAX_PDF_PAGES,
	pdfTextLayoutSchema,
	type BoardRole,
	type DocumentErrorCode,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { createDatabase } from '../db/client'
import {
	countUploadedDocumentPages,
	createDocument,
	deleteDocumentRow,
	getDocumentPageRow,
	getDocumentRow,
	getUserDocumentUsage,
	listDocumentPageRows,
	listDocumentRows,
	listDocumentVectorIDs,
	setDocumentStatus,
	toDocumentPageSummary,
	toDocumentSummary,
	upsertDocumentPage,
	type DocumentSourceFormat,
} from '../db/documents'
import type { DocumentPipelineMessage } from '../documents/types'

const DEFAULT_STORED_PDF_BYTES_QUOTA = 2 * 1_024 * 1_024 * 1_024
const DEFAULT_DAILY_PDF_PAGE_QUOTA = 1_000
const MAX_EXTRACTED_PAGE_TEXT_LENGTH = 200_000
const MAX_TEXT_LAYOUT_LENGTH = 2_000_000
const ALLOWED_PAGE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface AuthorizedBoardContext {
	role: BoardRole
	userID: string
}

export async function handleDocumentsList(
	request: IRequest,
	env: Env
) {
	const database = createDatabase(env)
	const rows = await listDocumentRows(database, request.params.boardID)
	const documents = await Promise.all(rows.map(async (row) =>
		toDocumentSummary(row, await countUploadedDocumentPages(database, row.id))
	))
	return { documents }
}

export async function handleDocumentCreate(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim()
	if (contentType !== 'application/pdf') {
		return handleOfficeDocumentCreate(request, env, authorization, contentType)
	}

	const declaredBytes = parsePositiveInteger(request.headers.get('content-length'))
	if (declaredBytes && declaredBytes > MAX_PDF_BYTES) {
		return documentError(413, 'PDF_TOO_LARGE', 'PDF files must be 50 MB or smaller.', MAX_PDF_BYTES)
	}
	const pageCount = parsePositiveInteger(request.headers.get('x-document-page-count'))
	if (!pageCount) {
		return documentError(400, 'INVALID_PDF', 'The PDF page count is required.')
	}
	if (pageCount > MAX_PDF_PAGES) {
		return documentError(413, 'PDF_TOO_MANY_PAGES', 'PDF files must contain 200 pages or fewer.', MAX_PDF_PAGES)
	}

	const bytes = await request.arrayBuffer()
	if (bytes.byteLength > MAX_PDF_BYTES) {
		return documentError(413, 'PDF_TOO_LARGE', 'PDF files must be 50 MB or smaller.', MAX_PDF_BYTES)
	}
	if (!hasPDFSignature(bytes)) {
		return documentError(400, 'INVALID_PDF', 'The selected file is not a readable PDF.')
	}

	const database = createDatabase(env)
	const storedBytesQuota = readPositiveEnvNumber(
		env.PDF_STORED_BYTES_QUOTA,
		DEFAULT_STORED_PDF_BYTES_QUOTA
	)
	const dailyPageQuota = readPositiveEnvNumber(
		env.PDF_DAILY_PAGE_QUOTA,
		DEFAULT_DAILY_PDF_PAGE_QUOTA
	)
	const usage = await getUserDocumentUsage(database, authorization.userID, startOfUTCDay())
	if (usage.storedBytes + bytes.byteLength > storedBytesQuota) {
		return documentError(
			429,
			'STORED_BYTES_QUOTA_EXCEEDED',
			'Delete an older PDF before importing this one.',
			storedBytesQuota
		)
	}
	if (usage.dailyPages + pageCount > dailyPageQuota) {
		return documentError(
			429,
			'DAILY_PAGE_QUOTA_EXCEEDED',
			'Today’s PDF processing limit has been reached. Try again tomorrow.',
			dailyPageQuota
		)
	}

	const requestedID = request.headers.get('x-document-import-id')?.trim()
	const documentID = requestedID && isUUID(requestedID) ? requestedID : crypto.randomUUID()
	const existing = await getDocumentRow(database, request.params.boardID, documentID)
	if (existing) {
		if (existing.ownerID !== authorization.userID) {
			return documentError(409, 'INVALID_PDF', 'That import identifier is already in use.')
		}
		const pages = await listDocumentPageRows(database, existing.id)
		return {
			document: toDocumentSummary(
				existing,
				pages.length
			),
			pages: pages.map(toDocumentPageSummary),
		}
	}

	const title = readDocumentTitle(request.headers.get('x-document-title'))
	const r2Key = getOriginalPDFKey(request.params.boardID, documentID)
	await env.TLDRAW_BUCKET.put(r2Key, bytes, {
		httpMetadata: {
			contentDisposition: `inline; filename="${safeFilename(title)}"`,
			contentType: 'application/pdf',
		},
	})
	try {
		await createDocument(database, {
			boardID: request.params.boardID,
			byteSize: bytes.byteLength,
			id: documentID,
			ownerID: authorization.userID,
			pageCount,
			r2Key,
			title,
		})
	} catch (error) {
		await env.TLDRAW_BUCKET.delete(r2Key)
		throw error
	}
	const created = await getDocumentRow(database, request.params.boardID, documentID)
	if (!created) throw new Error('Document metadata was not created')
	return Response.json({ document: toDocumentSummary(created, 0), pages: [] }, { status: 201 })
}

export async function handleDocumentGet(request: IRequest, env: Env) {
	return getDocumentStatusResponse(request, env)
}

export async function handleDocumentStatus(request: IRequest, env: Env) {
	return getDocumentStatusResponse(request, env)
}

export async function handleDocumentPageUpload(request: IRequest, env: Env) {
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, request.params.boardID, request.params.documentID)
	if (!documentRow) return documentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
	const pageNumber = parsePageNumber(request.params.pageNumber, documentRow.pageCount)
	if (!pageNumber) return documentError(400, 'INVALID_PAGE', 'The PDF page number is invalid.')

	const form = await request.formData().catch(() => null)
	const image = form?.get('image')
	const extractedText = form?.get('text')
	const rawTextLayout = form?.get('textLayout')
	const width = parseFiniteNumber(form?.get('width'))
	const height = parseFiniteNumber(form?.get('height'))
	if (
		!(image instanceof File) ||
		!ALLOWED_PAGE_IMAGE_TYPES.has(image.type) ||
		typeof extractedText !== 'string' ||
		typeof rawTextLayout !== 'string' ||
		!width ||
		!height
	) {
		return documentError(400, 'INVALID_PAGE', 'The rendered PDF page is invalid.')
	}
	if (image.size > MAX_PDF_PAGE_IMAGE_BYTES) {
		return documentError(
			413,
			'PAGE_IMAGE_TOO_LARGE',
			'The rendered page image is too large.',
			MAX_PDF_PAGE_IMAGE_BYTES
		)
	}
	if (extractedText.length > MAX_EXTRACTED_PAGE_TEXT_LENGTH) {
		return documentError(400, 'INVALID_PAGE', 'The extracted page text is too long.')
	}
	if (rawTextLayout.length > MAX_TEXT_LAYOUT_LENGTH) {
		return documentError(400, 'INVALID_PAGE', 'The extracted PDF text layout is too large.')
	}
	const parsedTextLayout: unknown = (() => {
		try {
			return JSON.parse(rawTextLayout)
		} catch {
			return null
		}
	})()
	const textLayout = pdfTextLayoutSchema.safeParse(parsedTextLayout)
	if (!textLayout.success) {
		return documentError(400, 'INVALID_PAGE', 'The extracted PDF text layout is invalid.')
	}

	const imageR2Key = getPageImageKey(
		request.params.boardID,
		documentRow.id,
		pageNumber,
		image.type
	)
	const previousPage = await getDocumentPageRow(database, documentRow.id, pageNumber)
	await env.TLDRAW_BUCKET.put(imageR2Key, image.stream(), {
		httpMetadata: { contentType: image.type },
	})
	await upsertDocumentPage(database, {
		documentID: documentRow.id,
		extractedText,
		height,
		imageR2Key,
		pageNumber,
		textLayout: JSON.stringify(textLayout.data),
		width,
	})
	if (previousPage && previousPage.imageR2Key !== imageR2Key) {
		await env.TLDRAW_BUCKET.delete(previousPage.imageR2Key)
	}
	return Response.json({ ok: true, pageNumber })
}

export async function handleDocumentComplete(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	_authorization: AuthorizedBoardContext
) {
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, request.params.boardID, request.params.documentID)
	if (!documentRow) return documentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
	if (documentRow.pageCount === 0) {
		return documentError(409, 'IMPORT_INCOMPLETE', 'Office conversion is still in progress.')
	}
	const uploadedPageCount = await countUploadedDocumentPages(database, documentRow.id)
	if (uploadedPageCount !== documentRow.pageCount) {
		return documentError(
			409,
			'IMPORT_INCOMPLETE',
			`${documentRow.pageCount - uploadedPageCount} PDF pages still need to be uploaded.`
		)
	}
	await setDocumentStatus(database, documentRow.id, 'processing')
	const message: DocumentPipelineMessage = {
		boardID: documentRow.boardID,
		documentID: documentRow.id,
		kind: 'document-index',
		ownerID: documentRow.ownerID,
	}
	await env.DOCUMENT_PIPELINE.send(message)
	const pages = await listDocumentPageRows(database, documentRow.id)
	return Response.json({
		document: toDocumentSummary(
			{ ...documentRow, failureReason: null, status: 'processing' },
			uploadedPageCount
		),
		pages: pages.map(toDocumentPageSummary),
	}, { status: 202 })
}

export async function handleDocumentRetry(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	_authorization: AuthorizedBoardContext
) {
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, request.params.boardID, request.params.documentID)
	if (!documentRow) return documentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
	if (documentRow.sourceFormat !== 'pdf' && documentRow.pageCount === 0) {
		await setDocumentStatus(database, documentRow.id, 'processing')
		await env.DOCUMENT_PIPELINE.send({
			boardID: documentRow.boardID,
			documentID: documentRow.id,
			kind: 'office-conversion',
			ownerID: documentRow.ownerID,
		} satisfies DocumentPipelineMessage)
		return Response.json({ ok: true }, { status: 202 })
	}
	if (await countUploadedDocumentPages(database, documentRow.id) !== documentRow.pageCount) {
		return documentError(409, 'IMPORT_INCOMPLETE', 'Upload every PDF page before retrying processing.')
	}
	await setDocumentStatus(database, documentRow.id, 'processing')
	await env.DOCUMENT_PIPELINE.send({
		boardID: documentRow.boardID,
		documentID: documentRow.id,
		kind: 'document-index',
		ownerID: documentRow.ownerID,
	} satisfies DocumentPipelineMessage)
	return Response.json({ ok: true }, { status: 202 })
}

export async function handleDocumentOriginalDownload(
	request: IRequest,
	env: Env,
	ctx: ExecutionContext
) {
	const documentRow = await getDocumentRow(
		createDatabase(env),
		request.params.boardID,
		request.params.documentID
	)
	if (!documentRow) return documentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
	if (documentRow.pageCount === 0) {
		return documentError(409, 'IMPORT_INCOMPLETE', 'Office conversion is still in progress.')
	}
	const downloadDisposition = getOriginalPDFDownloadDisposition(request.url, documentRow.title)
	return serveAuthorizedR2Object(
		request,
		env,
		ctx,
		documentRow.r2Key,
		downloadDisposition ? { contentDisposition: downloadDisposition } : undefined
	)
}

export async function handleDocumentPageDownload(
	request: IRequest,
	env: Env,
	ctx: ExecutionContext
) {
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, request.params.boardID, request.params.documentID)
	if (!documentRow) return documentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
	const pageNumber = parsePageNumber(request.params.pageNumber, documentRow.pageCount)
	if (!pageNumber) return documentError(400, 'INVALID_PAGE', 'The PDF page number is invalid.')
	const page = await getDocumentPageRow(database, documentRow.id, pageNumber)
	if (!page) return documentError(404, 'INVALID_PAGE', 'PDF page not found.')
	return serveAuthorizedR2Object(request, env, ctx, page.imageR2Key)
}

export async function handleDocumentDelete(request: IRequest, env: Env) {
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, request.params.boardID, request.params.documentID)
	if (!documentRow) return documentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
	const [pages, vectorIDs] = await Promise.all([
		listDocumentPageRows(database, documentRow.id),
		listDocumentVectorIDs(database, documentRow.id),
	])
	if (vectorIDs.length) await env.DOCUMENT_VECTORS.deleteByIds(vectorIDs)
	await env.TLDRAW_BUCKET.delete([documentRow.r2Key, ...pages.map(({ imageR2Key }) => imageR2Key)])
	await deleteDocumentRow(database, documentRow.id)
	return Response.json({ ok: true })
}

async function getDocumentStatusResponse(request: IRequest, env: Env) {
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, request.params.boardID, request.params.documentID)
	if (!documentRow) return documentError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.')
	const pages = await listDocumentPageRows(database, documentRow.id)
	return {
		document: toDocumentSummary(documentRow, pages.length),
		pages: pages.map(toDocumentPageSummary),
	}
}

async function serveAuthorizedR2Object(
	request: IRequest,
	env: Env,
	ctx: ExecutionContext,
	objectName: string,
	options?: { contentDisposition: string }
) {
	const cacheKey = new Request(request.url, { headers: request.headers })
	const cached = options ? null : await caches.default.match(cacheKey)
	if (cached) return cached
	const object = await env.TLDRAW_BUCKET.get(objectName, {
		onlyIf: request.headers,
		range: request.headers,
	})
	if (!object) return documentError(404, 'DOCUMENT_NOT_FOUND', 'Document asset not found.')

	const headers = new Headers()
	object.writeHttpMetadata(headers)
	headers.set(
		'cache-control',
		options ? 'private, no-store' : 'private, max-age=31536000, immutable'
	)
	if (options) headers.set('content-disposition', options.contentDisposition)
	headers.set('content-security-policy', "default-src 'none'")
	headers.set('x-content-type-options', 'nosniff')
	headers.set('etag', object.httpEtag)
	headers.set('accept-ranges', 'bytes')
	let contentRange: string | undefined
	if (object.range) {
		if ('suffix' in object.range) {
			contentRange = `bytes ${object.size - object.range.suffix}-${object.size - 1}/${object.size}`
		} else {
			const start = object.range.offset ?? 0
			const end = object.range.length ? start + object.range.length - 1 : object.size - 1
			if (start !== 0 || end !== object.size - 1) {
				contentRange = `bytes ${start}-${end}/${object.size}`
			}
		}
	}
	if (contentRange) headers.set('content-range', contentRange)
	const body = 'body' in object && object.body ? object.body : null
	const status = body ? (contentRange ? 206 : 200) : 304
	if (body && status === 200 && !options) {
		const [cacheBody, responseBody] = body.tee()
		ctx.waitUntil(caches.default.put(cacheKey, new Response(cacheBody, { headers, status })))
		return new Response(responseBody, { headers, status })
	}
	return new Response(body, { headers, status })
}

function documentError(
	status: number,
	code: DocumentErrorCode,
	error: string,
	limit?: number
) {
	return Response.json({ code, error, ...(limit === undefined ? {} : { limit }) }, { status })
}

export function getOriginalPDFKey(boardID: string, documentID: string) {
	return `boards/${safeKeyPart(boardID)}/documents/${safeKeyPart(documentID)}/original.pdf`
}

function getPageImageKey(
	boardID: string,
	documentID: string,
	pageNumber: number,
	contentType: string
) {
	const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
	return `boards/${safeKeyPart(boardID)}/documents/${safeKeyPart(documentID)}/pages/${pageNumber}.${extension}`
}

function safeKeyPart(value: string) {
	return value.replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function parsePositiveInteger(value: FormDataEntryValue | string | null | undefined) {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
	const parsed = Number(value)
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function parseFiniteNumber(value: FormDataEntryValue | null | undefined) {
	if (typeof value !== 'string') return null
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 && parsed <= 20_000 ? parsed : null
}

function parsePageNumber(value: string, pageCount: number) {
	const pageNumber = parsePositiveInteger(value)
	return pageNumber && pageNumber <= pageCount ? pageNumber : null
}

function hasPDFSignature(bytes: ArrayBuffer) {
	const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 5))
	return signature.length === 5 &&
		signature[0] === 0x25 &&
		signature[1] === 0x50 &&
		signature[2] === 0x44 &&
		signature[3] === 0x46 &&
		signature[4] === 0x2d
}

function readDocumentTitle(value: string | null) {
	if (!value) return 'Imported PDF'
	let decoded = value
	try {
		decoded = decodeURIComponent(value)
	} catch {
		// The raw header remains a usable fallback title.
	}
	return decoded.trim().replace(/[\r\n]+/g, ' ').slice(0, 180) || 'Imported PDF'
}

export function safeFilename(title: string) {
	const normalized = title
		.normalize('NFKD')
		.replace(/[^\x20-\x7e]/g, '_')
		.replace(/["\\/\r\n]+/g, '_')
	return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`
}

async function handleOfficeDocumentCreate(
	request: IRequest,
	env: Env,
	authorization: AuthorizedBoardContext,
	contentType: string | undefined
) {
	const title = readDocumentTitle(request.headers.get('x-document-title'))
	const sourceFormat = readOfficeSourceFormat(
		contentType,
		title,
		request.headers.get('x-document-source-format')
	)
	if (!sourceFormat) {
		return documentError(400, 'INVALID_OFFICE', 'Choose a DOCX, PPTX, or PDF file to import.')
	}
	const declaredBytes = parsePositiveInteger(request.headers.get('content-length'))
	if (!declaredBytes) {
		return documentError(411, 'INVALID_OFFICE', 'The Office file size is required.')
	}
	if (declaredBytes > MAX_OFFICE_BYTES) {
		return documentError(
			413,
			'OFFICE_TOO_LARGE',
			'Office files must be 50 MB or smaller.',
			MAX_OFFICE_BYTES
		)
	}
	if (!request.body) {
		return documentError(400, 'INVALID_OFFICE', 'The Office file is empty.')
	}

	const requestedID = request.headers.get('x-document-import-id')?.trim()
	const documentID = requestedID && isUUID(requestedID) ? requestedID : crypto.randomUUID()
	const database = createDatabase(env)
	const existing = await getDocumentRow(database, request.params.boardID, documentID)
	if (existing) {
		if (existing.ownerID !== authorization.userID) {
			return documentError(409, 'INVALID_OFFICE', 'That import identifier is already in use.')
		}
		const pages = await listDocumentPageRows(database, existing.id)
		return {
			document: toDocumentSummary(existing, pages.length),
			pages: pages.map(toDocumentPageSummary),
		}
	}

	const storedBytesQuota = readPositiveEnvNumber(
		env.PDF_STORED_BYTES_QUOTA,
		DEFAULT_STORED_PDF_BYTES_QUOTA
	)
	const usage = await getUserDocumentUsage(database, authorization.userID, startOfUTCDay())
	if (usage.storedBytes + declaredBytes > storedBytesQuota) {
		return documentError(
			429,
			'STORED_BYTES_QUOTA_EXCEEDED',
			'Delete an older document before importing this one.',
			storedBytesQuota
		)
	}

	const inspectedBody = await inspectStreamPrefix(request.body, 4)
	const signature = inspectedBody.prefix
	if (!hasZIPSignature(signature)) {
		await inspectedBody.body.cancel()
		return documentError(400, 'INVALID_OFFICE', 'The selected Office file is not readable.')
	}
	const sourceR2Key = getOfficeSourceKey(request.params.boardID, documentID, sourceFormat)
	const fixedLengthBody = inspectedBody.body.pipeThrough(new FixedLengthStream(declaredBytes))
	await env.TLDRAW_BUCKET.put(sourceR2Key, fixedLengthBody, {
		httpMetadata: {
			contentDisposition: `attachment; filename="${safeSourceFilename(title, sourceFormat)}"`,
			contentType: getOfficeContentType(sourceFormat),
		},
	})
	try {
		await createDocument(database, {
			boardID: request.params.boardID,
			byteSize: declaredBytes,
			id: documentID,
			ownerID: authorization.userID,
			pageCount: 0,
			r2Key: sourceR2Key,
			sourceFormat,
			title,
		})
	} catch (error) {
		await env.TLDRAW_BUCKET.delete(sourceR2Key)
		throw error
	}
	try {
		await env.DOCUMENT_PIPELINE.send({
			boardID: request.params.boardID,
			documentID,
			kind: 'office-conversion',
			ownerID: authorization.userID,
		} satisfies DocumentPipelineMessage)
	} catch (error) {
		await setDocumentStatus(database, documentID, 'failed', 'Office conversion could not be queued')
		throw error
	}
	const created = await getDocumentRow(database, request.params.boardID, documentID)
	if (!created) throw new Error('Office document metadata was not created')
	return Response.json({ document: toDocumentSummary(created, 0), pages: [] }, { status: 202 })
}

export function readOfficeSourceFormat(
	contentType: string | undefined,
	title: string,
	declaredFormat: string | null
): Exclude<DocumentSourceFormat, 'pdf'> | null {
	const normalizedTitle = title.toLowerCase()
	if (
		declaredFormat === 'docx' &&
		(contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
			normalizedTitle.endsWith('.docx'))
	) return 'docx'
	if (
		declaredFormat === 'pptx' &&
		(contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
			normalizedTitle.endsWith('.pptx'))
	) return 'pptx'
	return null
}

async function inspectStreamPrefix(stream: ReadableStream<Uint8Array>, length: number) {
	const reader = stream.getReader()
	const prefix = new Uint8Array(length)
	const bufferedChunks: Uint8Array[] = []
	let written = 0
	while (written < length) {
		const chunk = await reader.read()
		if (chunk.done) break
		bufferedChunks.push(chunk.value)
		const copyLength = Math.min(chunk.value.length, length - written)
		prefix.set(chunk.value.subarray(0, copyLength), written)
		written += copyLength
	}
	let bufferedOffset = 0
	const body = new ReadableStream<Uint8Array>({
		async cancel(reason) {
			await reader.cancel(reason)
		},
		async pull(controller) {
			if (bufferedOffset < bufferedChunks.length) {
				controller.enqueue(bufferedChunks[bufferedOffset])
				bufferedOffset += 1
				return
			}
			const chunk = await reader.read()
			if (chunk.done) controller.close()
			else controller.enqueue(chunk.value)
		},
	})
	return { body, prefix: prefix.subarray(0, written) }
}

function hasZIPSignature(bytes: Uint8Array) {
	return bytes.length === 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		bytes[2] === 0x03 &&
		bytes[3] === 0x04
}

function getOfficeSourceKey(
	boardID: string,
	documentID: string,
	sourceFormat: Exclude<DocumentSourceFormat, 'pdf'>
) {
	return `boards/${safeKeyPart(boardID)}/documents/${safeKeyPart(documentID)}/source.${sourceFormat}`
}

function getOfficeContentType(sourceFormat: Exclude<DocumentSourceFormat, 'pdf'>) {
	return sourceFormat === 'docx'
		? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

function safeSourceFilename(title: string, sourceFormat: Exclude<DocumentSourceFormat, 'pdf'>) {
	const normalized = title
		.normalize('NFKD')
		.replace(/[^\x20-\x7e]/g, '_')
		.replace(/["\\/\r\n]+/g, '_')
	return normalized.toLowerCase().endsWith(`.${sourceFormat}`)
		? normalized
		: `${normalized}.${sourceFormat}`
}

export function getOriginalPDFDownloadDisposition(requestURL: string, title: string) {
	const isDownload = new URL(requestURL).searchParams.get('download') === '1'
	return isDownload ? `attachment; filename="${safeFilename(title)}"` : null
}

function startOfUTCDay() {
	const now = new Date()
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function readPositiveEnvNumber(value: string | undefined, fallback: number) {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function isUUID(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
