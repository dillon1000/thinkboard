import { describe, expect, it } from 'vitest'
import {
	addCraftWhiteboardImportParameters,
	readCraftWhiteboardImportParameters,
} from './craftWhiteboardNavigation'

describe('Craft whiteboard import navigation', () => {
	it('round-trips document and whiteboard IDs through a board URL', () => {
		const url = addCraftWhiteboardImportParameters('/boards/board-1', {
			boardID: 'board-1',
			documentID: 'document/1',
			title: 'Study map',
			whiteboardBlockID: 'whiteboard & 1',
		})

		expect(url).toBe(
			'/boards/board-1?craftDocumentID=document%2F1&craftWhiteboardID=whiteboard+%26+1'
		)
		expect(readCraftWhiteboardImportParameters(new URL(url, 'https://example.com').search))
			.toEqual({
				documentID: 'document/1',
				whiteboardBlockID: 'whiteboard & 1',
			})
	})

	it('rejects incomplete one-shot import parameters', () => {
		expect(readCraftWhiteboardImportParameters('?craftDocumentID=document-1')).toBeNull()
	})
})
