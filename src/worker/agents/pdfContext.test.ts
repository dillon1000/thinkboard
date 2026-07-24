import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/client'
import { hydratePDFSelectionContext } from './pdfContext'

describe('hydratePDFSelectionContext', () => {
	it('attaches exact selected PDF text after verifying the document page', async () => {
		const limit = vi.fn()
			.mockResolvedValueOnce([{
				id: 'document-1',
				title: 'Biology reader',
			}])
			.mockResolvedValueOnce([{
				documentID: 'document-1',
				pageNumber: 12,
			}])
		const database = {
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => ({ limit })),
				})),
			})),
		} as unknown as Database

		const result = await hydratePDFSelectionContext(database, 'board-1', {
			boardID: 'board-1',
			pdfTextSelection: {
				documentID: 'document-1',
				pageNumber: 12,
				text: 'Mitosis produces two daughter cells.',
			},
			relatedShapes: [],
			relationships: [],
			selection: [],
		})

		expect(result?.documentText).toEqual([{
			documentID: 'document-1',
			documentTitle: 'Biology reader',
			pageNumber: 12,
			text: 'Mitosis produces two daughter cells.',
		}])
		expect(limit).toHaveBeenCalledTimes(2)
	})
})
