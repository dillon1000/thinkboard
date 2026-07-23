import { describe, expect, it } from 'vitest'
import { findMatchingPDFDocument, getPDFRenderScale } from './pdfImport'

describe('getPDFRenderScale', () => {
	it('renders standard pages at four times density on high-density displays', () => {
		expect(getPDFRenderScale(612, 792, 2)).toBe(4)
	})

	it('keeps standard pages above the previous two-times density on regular displays', () => {
		expect(getPDFRenderScale(612, 792, 1)).toBe(3)
	})

	it('caps unusually large pages by pixel count and canvas dimensions', () => {
		const scale = getPDFRenderScale(2_000, 3_000, 3)

		expect(scale).toBeLessThan(2)
		expect(2_000 * scale).toBeLessThanOrEqual(4_096)
		expect(2_000 * scale * 3_000 * scale).toBeLessThanOrEqual(9_000_000)
	})
})

describe('findMatchingPDFDocument', () => {
	it('finds an existing import that can be rendered again in place', () => {
		const document = {
			byteSize: 42_000,
			pageCount: 18,
			title: 'notes.pdf',
		} as Parameters<typeof findMatchingPDFDocument>[0][number]

		expect(findMatchingPDFDocument(
			[document],
			{ name: 'notes.pdf', size: 42_000 },
			18
		)).toBe(document)
	})

	it('does not match a different file with the same name', () => {
		const document = {
			byteSize: 42_000,
			pageCount: 18,
			title: 'notes.pdf',
		} as Parameters<typeof findMatchingPDFDocument>[0][number]

		expect(findMatchingPDFDocument(
			[document],
			{ name: 'notes.pdf', size: 43_000 },
			18
		)).toBeNull()
	})
})
