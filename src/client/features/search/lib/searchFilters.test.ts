import type { GlobalSearchResult } from '@agentboard/shared'
import { describe, expect, it } from 'vitest'
import {
	filterGlobalSearchResults,
	getGlobalSearchFilter,
} from './searchFilters'

const results: GlobalSearchResult[] = [
	{
		artifactKind: 'review-note',
		boardID: 'space-one',
		boardTitle: 'Biology',
		kind: 'shape',
		score: 0.9,
		shapeID: 'review-one',
		snippet: 'Cell review',
		title: 'Cell review',
	},
	{
		artifactKind: 'flashcard',
		boardID: 'space-one',
		boardTitle: 'Biology',
		kind: 'shape',
		score: 0.8,
		shapeID: 'card-one',
		snippet: 'Cell card',
		title: 'Cell card',
	},
	{
		boardID: 'space-two',
		boardTitle: 'Chemistry',
		documentID: 'document-one',
		kind: 'document-page',
		pageNumber: 12,
		score: 0.7,
		snippet: 'Bonding notes',
		title: 'Course book',
	},
	{
		boardID: 'space-two',
		boardTitle: 'Chemistry',
		kind: 'lecture-segment',
		lectureID: 'lecture-one',
		score: 0.6,
		snippet: 'Bonding lecture',
		startSecond: 84,
		title: 'Week four',
	},
]

describe('global search filters', () => {
	it('assigns each result to one source filter', () => {
		expect(results.map(getGlobalSearchFilter)).toEqual([
			'canvas',
			'flashcards',
			'pdfs',
			'lectures',
		])
	})

	it('filters results without changing the original order', () => {
		expect(filterGlobalSearchResults(results, 'all')).toEqual(results)
		expect(filterGlobalSearchResults(results, 'pdfs')).toEqual([results[2]])
		expect(filterGlobalSearchResults(results, 'canvas')).toEqual([results[0]])
	})
})
