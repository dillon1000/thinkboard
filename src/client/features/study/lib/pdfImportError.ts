import { readProperty } from '@agentboard/shared'
import { isNumber, isString } from '@agentboard/shared'
export interface PDFImportFailure {
	details: string
	summary: string
}

interface PDFImportErrorContext {
	browser: string
	fileName?: string
	fileSize?: number
	location: string
	timestamp?: Date
}

export function describePDFImportFailure(
	error: unknown,
	context: PDFImportErrorContext
): PDFImportFailure {
	const summary = error instanceof Error && error.message
		? error.message
		: isString(error) && error
			? error
			: 'The document could not be imported.'
	const metadata = [
		'Document import failed',
		`Time: ${(context.timestamp ?? new Date()).toISOString()}`,
		`Page: ${context.location}`,
		`Browser: ${context.browser}`,
		...(context.fileName ? [`File: ${context.fileName}`] : []),
		...(isNumber(context.fileSize) ? [`File size: ${context.fileSize} bytes`] : []),
	]
	return {
		details: `${metadata.join('\n')}\n\n${formatError(error)}`,
		summary,
	}
}

function formatError(error: unknown, label = 'Error'): string {
	if (error instanceof Error) {
		const lines = [
			`${label}: ${error.name}`,
			`Message: ${error.message}`,
			...(error.stack ? [`Stack:\n${error.stack}`] : []),
		]
		const cause = readProperty(error, 'cause')
		return cause === undefined
			? lines.join('\n')
			: `${lines.join('\n')}\n\n${formatError(cause, 'Cause')}`
	}
	if (isString(error)) return `${label}: ${error}`
	try {
		return `${label}: ${JSON.stringify(error, null, 2)}`
	} catch {
		return `${label}: ${String(error)}`
	}
}
