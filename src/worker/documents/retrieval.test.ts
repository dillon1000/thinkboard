import { describe, expect, it, vi } from 'vitest'
import type { ModelMessage } from 'ai'
import {
	attachDocumentRetrieval,
	queryBoardDocumentVectors,
} from './retrieval'

describe('queryBoardDocumentVectors', () => {
	it('returns nothing when Vectorize only yields another board', async () => {
		const results = await queryBoardDocumentVectors(async () => ({
			matches: [{
				metadata: {
					boardId: 'board-b',
					chunkText: 'Cross-board text',
					documentId: 'document-b',
					documentTitle: 'Private reader',
					pageNumber: 1,
				},
				score: 1,
			}],
		}), [0.1, 0.2], 'board-a')

		expect(results).toEqual([])
	})

	it('filters at query time and discards cross-board matches defensively', async () => {
		const query = vi.fn(async () => ({
			matches: [
				{
					metadata: {
						boardId: 'board-b',
						chunkText: 'Private content from another board',
						documentId: 'document-b',
						documentTitle: 'Other board',
						pageNumber: 4,
					},
					score: 0.99,
				},
				{
					metadata: {
						boardId: 'board-a',
						chunkText: 'Allowed content',
						documentId: 'document-a',
						documentTitle: 'Course reader',
						pageNumber: 2,
					},
					score: 0.9,
				},
			],
		}))

		const results = await queryBoardDocumentVectors(query, [0.1, 0.2], 'board-a')

		expect(query).toHaveBeenCalledWith([0.1, 0.2], {
			filter: { boardId: 'board-a' },
			returnMetadata: 'all',
			topK: 6,
		})
		expect(results).toEqual([expect.objectContaining({
			documentID: 'document-a',
			documentTitle: 'Course reader',
			pageNumber: 2,
		})])
		expect(JSON.stringify(results)).not.toContain('Private content')
	})

	it('returns a timestamped lecture result from the same board index', async () => {
		const results = await queryBoardDocumentVectors(async () => ({
			matches: [{
				metadata: {
					boardId: 'board-a',
					chunkText: 'The lecturer explains entropy here.',
					endSecond: 104,
					lectureId: 'lecture-a',
					lectureTitle: 'Thermodynamics review',
					resultKind: 'lecture',
					startSecond: 92,
				},
				score: 0.95,
			}],
		}), [0.1, 0.2], 'board-a')

		expect(results).toEqual([{
			chunkText: 'The lecturer explains entropy here.',
			endSecond: 104,
			lectureID: 'lecture-a',
			lectureTitle: 'Thermodynamics review',
			score: 0.95,
			sourceKind: 'lecture',
			startSecond: 92,
		}])
	})
})

describe('attachDocumentRetrieval', () => {
	it('adds a seekable lecture citation to the user context', () => {
		const messages: ModelMessage[] = [{ content: 'Explain entropy', role: 'user' }]
		const attached = attachDocumentRetrieval(messages, [{
			chunkText: 'Entropy counts compatible microstates.',
			endSecond: 104,
			lectureID: 'lecture-a',
			lectureTitle: 'Thermodynamics review',
			score: 0.95,
			sourceKind: 'lecture',
			startSecond: 92,
		}])

		expect(JSON.stringify(attached)).toContain(
			'[Thermodynamics review, 1:32](#lecture=lecture-a&t=92)'
		)
	})
})
