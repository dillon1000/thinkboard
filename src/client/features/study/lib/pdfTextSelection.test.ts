import { describe, expect, it } from 'vitest'
import {
	normalizePDFTextSelection,
	resolvePDFTextSelection,
} from './pdfTextSelection'

describe('normalizePDFTextSelection', () => {
	it('captures normalized text with its authorized PDF reference', () => {
		expect(normalizePDFTextSelection(
			'document-1',
			'12',
			'  Photosynthesis\n\nconverts light energy.  '
		)).toEqual({
			documentID: 'document-1',
			pageNumber: 12,
			text: 'Photosynthesis converts light energy.',
		})
	})

	it('rejects empty text and invalid page metadata', () => {
		expect(normalizePDFTextSelection('document-1', '0', 'Selected text')).toBeUndefined()
		expect(normalizePDFTextSelection('document-1', '1', '   ')).toBeUndefined()
		expect(normalizePDFTextSelection(undefined, '1', 'Selected text')).toBeUndefined()
	})
})

describe('resolvePDFTextSelection', () => {
	const retained = {
		documentID: 'document-1',
		pageNumber: 12,
		text: 'Retained PDF text',
	}

	it('keeps PDF context when focus collapses the browser selection', () => {
		expect(resolvePDFTextSelection(undefined, retained, false)).toBe(retained)
	})

	it('replaces retained context with a new PDF selection', () => {
		const active = { ...retained, text: 'New PDF text' }
		expect(resolvePDFTextSelection(active, retained, true)).toBe(active)
	})

	it('clears retained context when different text is selected', () => {
		expect(resolvePDFTextSelection(undefined, retained, true)).toBeUndefined()
	})
})
