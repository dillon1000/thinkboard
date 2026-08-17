import { describe, expect, it } from 'vitest'
import { findPDFCitationShape, parsePDFCitationHref } from './pdfCitation'

describe('parsePDFCitationHref', () => {
	it('parses an encoded PDF citation target', () => {
		expect(parsePDFCitationHref('#pdf-page=document%2Fone&page=12')).toEqual({
			documentID: 'document/one',
			pageNumber: 12,
		})
	})

	it('rejects external and invalid citation links', () => {
		expect(parsePDFCitationHref('https://example.com')).toBeNull()
		expect(parsePDFCitationHref('#pdf-page=document&page=0')).toBeNull()
		expect(parsePDFCitationHref('#pdf-page=document&page=1.5')).toBeNull()
	})
})

describe('findPDFCitationShape', () => {
	it('finds the matching document page among canvas shapes', () => {
		const matching = {
			props: { documentId: 'document-one', pageNumber: 7 },
			type: 'pdf-page',
		}
		const shapes = [
			{ props: {}, type: 'note' },
			matching,
		]

		expect(findPDFCitationShape(shapes, {
			documentID: 'document-one',
			pageNumber: 7,
		})).toBe(matching)
	})
})
