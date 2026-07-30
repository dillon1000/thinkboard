import { describe, expect, it } from 'vitest'
import { parseGlobalSearchMatches } from './globalSearch'

describe('global search result access', () => {
	it('returns only results whose board is in the authorized title map', () => {
		const matches: VectorizeMatches = {
			count: 2,
			matches: [
				{
					id: 'allowed',
					metadata: {
						artifactKind: 'note',
						boardId: 'board-1',
						chunkText: 'A useful explanation of entropy.',
						resultKind: 'shape',
						shapeId: 'shape:note',
						title: 'Entropy',
					},
					score: 0.92,
				} as VectorizeMatch,
				{
					id: 'blocked',
					metadata: {
						boardId: 'board-2',
						chunkText: 'Private content',
						documentId: 'document-2',
						documentTitle: 'Private document',
						pageNumber: 1,
					},
					score: 0.99,
				} as VectorizeMatch,
			],
		}

		expect(parseGlobalSearchMatches(matches, new Map([['board-1', 'Physics']]))).toEqual([{
			artifactKind: 'note',
			boardID: 'board-1',
			boardTitle: 'Physics',
			kind: 'shape',
			score: 0.92,
			shapeID: 'shape:note',
			snippet: 'A useful explanation of entropy.',
			title: 'Entropy',
		}])
	})

	it('returns lecture timestamps only for an authorized board', () => {
		const matches: VectorizeMatches = {
			count: 1,
			matches: [{
				id: 'lecture',
				metadata: {
					boardId: 'board-1',
					chunkText: 'A spoken explanation of entropy.',
					lectureId: 'lecture-1',
					lectureTitle: 'Thermodynamics review',
					resultKind: 'lecture',
					startSecond: 92,
				},
				score: 0.88,
			} as VectorizeMatch],
		}

		expect(parseGlobalSearchMatches(matches, new Map([['board-1', 'Physics']]))).toEqual([{
			boardID: 'board-1',
			boardTitle: 'Physics',
			kind: 'lecture-segment',
			lectureID: 'lecture-1',
			score: 0.88,
			snippet: 'A spoken explanation of entropy.',
			startSecond: 92,
			title: 'Thermodynamics review',
		}])
	})
})
