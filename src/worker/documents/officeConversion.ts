import { MAX_PDF_BYTES, MAX_PDF_PAGES } from '@agentboard/shared'
import {
	completeOfficeDocumentConversion,
	getDocumentRow,
	getUserDocumentUsage,
} from '../db/documents'
import { createDatabase } from '../db/client'
import { getOriginalPDFKey, safeFilename } from '../routes/documents'
import type { OfficeConversionMessage } from './types'

const DEFAULT_STORED_PDF_BYTES_QUOTA = 2 * 1_024 * 1_024 * 1_024
const DEFAULT_DAILY_PDF_PAGE_QUOTA = 1_000
const OFFICE_CONVERSION_TIMEOUT_MS = 120_000

/**
 * Converts one stored DOCX or PPTX into the PDF used by the normal import pipeline. File data
 * streams through the Sandbox RPC transport in both directions, so the Worker does not buffer it.
 */
export async function processOfficeConversion(message: OfficeConversionMessage, env: Env) {
	const database = createDatabase(env)
	const documentRow = await getDocumentRow(database, message.boardID, message.documentID)
	if (!documentRow || documentRow.pageCount > 0) return
	if (documentRow.sourceFormat === 'pdf') {
		throw new Error('PDF documents do not require Office conversion')
	}
	const source = await env.TLDRAW_BUCKET.get(documentRow.r2Key)
	if (!source?.body) throw new Error('The Office source file is missing')

	// Sandbox code is loaded only for conversion jobs, which keeps normal Worker startup lean.
	const { getSandbox } = await import('@cloudflare/sandbox')
	const sandbox = getSandbox(env.Sandbox, `office-${documentRow.id}`, {
		enableDefaultSession: false,
		normalizeId: true,
		sleepAfter: '1m',
	})
	const inputPath = `/workspace/input.${documentRow.sourceFormat}`
	const outputDirectory = '/workspace/output'
	const outputPath = `${outputDirectory}/input.pdf`
	try {
		await sandbox.exec(
			`rm -rf ${outputDirectory} /tmp/agentboard-office-home /tmp/agentboard-office-profile && mkdir -p ${outputDirectory} /tmp/agentboard-office-home`,
			{ timeout: 10_000 }
		)
		await sandbox.writeFile(inputPath, source.body)
		const conversion = await sandbox.exec(
			getLibreOfficeCommand(documentRow.sourceFormat, inputPath, outputDirectory),
			{ timeout: OFFICE_CONVERSION_TIMEOUT_MS + 10_000 }
		)
		if (!conversion.success) {
			throw new Error(`LibreOffice conversion failed: ${conversion.stderr || conversion.stdout}`)
		}

		const inspection = await sandbox.exec(`pdfinfo ${outputPath}`, { timeout: 15_000 })
		if (!inspection.success) {
			throw new Error(`Converted PDF validation failed: ${inspection.stderr || inspection.stdout}`)
		}
		const pageCount = readPDFPageCount(inspection.stdout)
		if (!pageCount) throw new Error('Converted PDF did not report a page count')
		if (pageCount > MAX_PDF_PAGES) {
			throw new Error(`Converted PDF contains more than ${MAX_PDF_PAGES} pages`)
		}

		const output = await sandbox.readFile(outputPath, { encoding: 'none' })
		if (output.size > MAX_PDF_BYTES) {
			throw new Error('Converted PDF is larger than 50 MB')
		}
		await enforceConvertedDocumentQuota(
			env,
			message.ownerID,
			documentRow.byteSize,
			output.size,
			pageCount
		)

		const pdfR2Key = getOriginalPDFKey(documentRow.boardID, documentRow.id)
		const fixedLengthPDF = output.content.pipeThrough(new FixedLengthStream(output.size))
		await env.TLDRAW_BUCKET.put(pdfR2Key, fixedLengthPDF, {
			httpMetadata: {
				contentDisposition: `inline; filename="${safeFilename(documentRow.title)}"`,
				contentType: 'application/pdf',
			},
		})
		try {
			await completeOfficeDocumentConversion(database, {
				byteSize: output.size,
				documentID: documentRow.id,
				pageCount,
				r2Key: pdfR2Key,
			})
		} catch (error) {
			await env.TLDRAW_BUCKET.delete(pdfR2Key)
			throw error
		}
		await env.TLDRAW_BUCKET.delete(documentRow.r2Key)
		console.info(JSON.stringify({
			boardID: documentRow.boardID,
			documentID: documentRow.id,
			outputBytes: output.size,
			pageCount,
			pipelineStage: 'office-conversion-complete',
			sourceFormat: documentRow.sourceFormat,
		}))
	} finally {
		await sandbox.destroy().catch((error) => {
			console.error(JSON.stringify({
				documentID: documentRow.id,
				error: getErrorMessage(error),
				pipelineStage: 'office-sandbox-cleanup-failed',
			}))
		})
	}
}

export function readPDFPageCount(pdfInfo: string) {
	const match = /^Pages:\s+(\d+)$/m.exec(pdfInfo)
	if (!match) return null
	const pageCount = Number(match[1])
	return Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : null
}

function getLibreOfficeCommand(
	sourceFormat: 'docx' | 'pptx',
	inputPath: string,
	outputDirectory: string
) {
	const pdfFilter = sourceFormat === 'docx' ? 'writer_pdf_Export' : 'impress_pdf_Export'
	return [
		'env -i',
		'HOME=/tmp/agentboard-office-home',
		'PATH=/usr/bin:/bin',
		'SAL_USE_VCLPLUGIN=svp',
		`timeout --signal=KILL ${OFFICE_CONVERSION_TIMEOUT_MS / 1_000}s`,
		'libreoffice --headless --safe-mode --nologo --nodefault --nofirststartwizard --norestore --nolockcheck',
		'-env:UserInstallation=file:///tmp/agentboard-office-profile',
		`--convert-to pdf:${pdfFilter}`,
		`--outdir ${outputDirectory}`,
		inputPath,
	].join(' ')
}

async function enforceConvertedDocumentQuota(
	env: Env,
	ownerID: string,
	sourceBytes: number,
	outputBytes: number,
	pageCount: number
) {
	const usage = await getUserDocumentUsage(createDatabase(env), ownerID, startOfUTCDay())
	const storedBytesQuota = readPositiveEnvNumber(
		env.PDF_STORED_BYTES_QUOTA,
		DEFAULT_STORED_PDF_BYTES_QUOTA
	)
	const dailyPageQuota = readPositiveEnvNumber(
		env.PDF_DAILY_PAGE_QUOTA,
		DEFAULT_DAILY_PDF_PAGE_QUOTA
	)
	if (usage.storedBytes - sourceBytes + outputBytes > storedBytesQuota) {
		throw new Error('Stored document quota exceeded after Office conversion')
	}
	if (usage.dailyPages + pageCount > dailyPageQuota) {
		throw new Error('Daily page processing quota exceeded after Office conversion')
	}
}

function startOfUTCDay() {
	const now = new Date()
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function readPositiveEnvNumber(value: string | undefined, fallback: number) {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getErrorMessage<ErrorValue>(error: ErrorValue) {
	return error instanceof Error ? error.message : 'Unknown sandbox cleanup failure'
}
