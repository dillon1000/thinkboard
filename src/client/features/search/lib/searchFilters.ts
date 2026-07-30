import type { GlobalSearchResult } from '@agentboard/shared'

export type GlobalSearchFilter = 'all' | 'canvas' | 'flashcards' | 'pdfs' | 'lectures'

export const GLOBAL_SEARCH_FILTERS: ReadonlyArray<{
	id: GlobalSearchFilter
	label: string
}> = [
	{ id: 'all', label: 'All' },
	{ id: 'canvas', label: 'Canvas' },
	{ id: 'flashcards', label: 'Flashcards' },
	{ id: 'pdfs', label: 'PDFs' },
	{ id: 'lectures', label: 'Lectures' },
]

export function getGlobalSearchFilter(result: GlobalSearchResult): Exclude<GlobalSearchFilter, 'all'> {
	if (result.kind === 'document-page') return 'pdfs'
	if (result.kind === 'lecture-segment') return 'lectures'
	return result.artifactKind === 'flashcard' ? 'flashcards' : 'canvas'
}

export function filterGlobalSearchResults(
	results: GlobalSearchResult[],
	filter: GlobalSearchFilter,
) {
	if (filter === 'all') return results
	return results.filter((result) => getGlobalSearchFilter(result) === filter)
}

export function countGlobalSearchResults(results: GlobalSearchResult[]) {
	const counts: Record<GlobalSearchFilter, number> = {
		all: results.length,
		canvas: 0,
		flashcards: 0,
		pdfs: 0,
		lectures: 0,
	}
	for (const result of results) counts[getGlobalSearchFilter(result)] += 1
	return counts
}
