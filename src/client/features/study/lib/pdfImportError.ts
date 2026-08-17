import { z } from 'zod'

export interface PDFImportFailure {
	details: string
	summary: string
}

type PDFImportErrorValue = Error | z.infer<ReturnType<typeof z.json>>

interface PDFImportErrorContext {
	browser: string
	fileName?: string
	fileSize?: number
	location: string
	timestamp?: Date
}

export function describePDFImportFailure<Value>(
	error: Value,
	context: PDFImportErrorContext
): PDFImportFailure {
	const parsedError = parsePDFImportError(error)
	const stringError = z.string().safeParse(parsedError)
	const summary = parsedError instanceof Error && parsedError.message
		? parsedError.message
		: stringError.success && stringError.data
			? stringError.data
			: 'The document could not be imported.'
	const metadata = [
		'Document import failed',
		`Time: ${(context.timestamp ?? new Date()).toISOString()}`,
		`Page: ${context.location}`,
		`Browser: ${context.browser}`,
		...(context.fileName ? [`File: ${context.fileName}`] : []),
		...(context.fileSize === undefined ? [] : [`File size: ${context.fileSize} bytes`]),
	]
	return {
		details: `${metadata.join('\n')}\n\n${formatError(parsedError)}`,
		summary,
	}
}

function parsePDFImportError<Value>(error: Value): PDFImportErrorValue {
	if (error instanceof Error) return error
	const parsed = z.json().safeParse(error)
	return parsed.success ? parsed.data : String(error)
}

function formatError(error: PDFImportErrorValue, label = 'Error'): string {
	if (error instanceof Error) {
		const lines = [
			`${label}: ${error.name}`,
			`Message: ${error.message}`,
			...(error.stack ? [`Stack:\n${error.stack}`] : []),
		]
		return error.cause === undefined
			? lines.join('\n')
			: `${lines.join('\n')}\n\n${formatError(parsePDFImportError(error.cause), 'Cause')}`
	}
	const text = z.string().safeParse(error)
	if (text.success) return `${label}: ${text.data}`
	return `${label}: ${JSON.stringify(error, null, 2)}`
}
