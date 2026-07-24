import { describe, expect, it } from 'vitest'
import { getOriginalPDFDownloadDisposition } from './documents'

describe('getOriginalPDFDownloadDisposition', () => {
	it('serves explicit downloads as PDF attachments with a safe filename', () => {
		expect(getOriginalPDFDownloadDisposition(
			'https://board.example/api/document/original?download=1',
			'Course "notes".pdf'
		)).toBe('attachment; filename="Course _notes_.pdf"')
	})

	it('keeps the original PDF inline for rendering and range requests', () => {
		expect(getOriginalPDFDownloadDisposition(
			'https://board.example/api/document/original',
			'Course notes.pdf'
		)).toBeNull()
	})
})
