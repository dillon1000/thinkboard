import { describe, expect, it } from 'vitest'
import { describePDFImportFailure } from './pdfImportError'

describe('describePDFImportFailure', () => {
	it('includes the complete error chain and import environment', () => {
		const cause = new TypeError('undefined is not a function')
		const error = new Error('Unable to open PDF', { cause })
		const failure = describePDFImportFailure(error, {
			browser: 'Mobile Safari',
			fileName: 'notes.pdf',
			fileSize: 42_000,
			location: 'https://board.example/boards/one',
			timestamp: new Date('2026-07-23T21:30:00.000Z'),
		})

		expect(failure.summary).toBe('Unable to open PDF')
		expect(failure.details).toContain('Time: 2026-07-23T21:30:00.000Z')
		expect(failure.details).toContain('Browser: Mobile Safari')
		expect(failure.details).toContain('File: notes.pdf')
		expect(failure.details).toContain('File size: 42000 bytes')
		expect(failure.details).toContain('Error: Error')
		expect(failure.details).toContain('Cause: TypeError')
		expect(failure.details).toContain('undefined is not a function')
	})
})
