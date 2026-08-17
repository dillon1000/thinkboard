import { describe, expect, it } from 'vitest'
import { getOriginalPDFDownloadDisposition, readOfficeSourceFormat } from './documents'

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

describe('readOfficeSourceFormat', () => {
	it('accepts DOCX and PPTX only when the declared format matches the file metadata', () => {
		expect(readOfficeSourceFormat(
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'notes.docx',
			'docx'
		)).toBe('docx')
		expect(readOfficeSourceFormat(
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			'lecture.pptx',
			'pptx'
		)).toBe('pptx')
		expect(readOfficeSourceFormat('application/octet-stream', 'lecture.pptx', 'docx')).toBeNull()
	})
})
