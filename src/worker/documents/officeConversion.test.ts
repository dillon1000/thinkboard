import { describe, expect, it } from 'vitest'
import { readPDFPageCount } from './officeConversion'

describe('readPDFPageCount', () => {
	it('reads the positive page count reported by pdfinfo', () => {
		expect(readPDFPageCount('Title: Lecture\nPages:          42\nPDF version: 1.7\n')).toBe(42)
	})

	it('rejects missing and invalid page counts', () => {
		expect(readPDFPageCount('Title: Lecture\n')).toBeNull()
		expect(readPDFPageCount('Pages:          0\n')).toBeNull()
	})
})
