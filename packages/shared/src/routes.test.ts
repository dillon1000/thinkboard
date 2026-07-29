import { describe, expect, it } from 'vitest'
import { apiRoutes, appRoutes } from './routes'

describe('route builders', () => {
	it('encodes board IDs in application and socket paths', () => {
		expect(appRoutes.board('biology/week 1')).toBe('/boards/biology%2Fweek%201')
		expect(apiRoutes.archivedBoards).toBe('/api/boards/archived')
		expect(apiRoutes.boardRestore('biology/week 1')).toBe(
			'/api/boards/biology%2Fweek%201/restore'
		)
		expect(apiRoutes.boardSocket('biology/week 1')).toBe(
			'/api/connect/biology%2Fweek%201'
		)
	})

	it('scopes uploaded assets to their board', () => {
		expect(apiRoutes.asset('biology/week 1', 'diagram one.png')).toBe(
			'/api/boards/biology%2Fweek%201/assets/diagram%20one.png'
		)
	})

	it('scopes study conversations to their board', () => {
		expect(apiRoutes.studyConversations('biology/week 1')).toBe(
			'/api/boards/biology%2Fweek%201/conversations'
		)
		expect(apiRoutes.studyConversation('biology/week 1', 'conversation one')).toBe(
			'/api/boards/biology%2Fweek%201/conversations/conversation%20one'
		)
		expect(apiRoutes.studyConversationMessages('biology/week 1', 'conversation one')).toBe(
			'/api/boards/biology%2Fweek%201/conversations/conversation%20one/messages'
		)
	})

	it('scopes authoritative canvas context to its board', () => {
		expect(apiRoutes.boardContext('biology/week 1')).toBe(
			'/api/boards/biology%2Fweek%201/context'
		)
	})

	it('scopes Lock In reviews to their board', () => {
		expect(apiRoutes.boardLockInReview('biology/week 1')).toBe(
			'/api/boards/biology%2Fweek%201/lock-in/review'
		)
	})

	it('builds learning-science routes', () => {
		expect(apiRoutes.boardFlashcards('biology/week 1')).toBe(
			'/api/boards/biology%2Fweek%201/flashcards'
		)
		expect(apiRoutes.boardMistakes('biology/week 1')).toBe(
			'/api/boards/biology%2Fweek%201/mistakes'
		)
		expect(apiRoutes.boardMemories('biology/week 1')).toBe(
			'/api/boards/biology%2Fweek%201/memories'
		)
		expect(apiRoutes.studyReviews).toBe('/api/study/reviews')
		expect(apiRoutes.studyReview('review one')).toBe('/api/study/reviews/review%20one')
		expect(apiRoutes.studyMemory).toBe('/api/study/memory')
		expect(apiRoutes.studyMemoryItem('preferred pace')).toBe(
			'/api/study/memory/preferred%20pace'
		)
		expect(apiRoutes.studyAgentProfile).toBe('/api/study/agent-profile')
		expect(appRoutes.memory).toBe('/memory')
	})

	it('encodes external URLs in bookmark preview requests', () => {
		expect(apiRoutes.bookmarkPreview('https://example.com/?a=1&b=2')).toBe(
			'/api/unfurl?url=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2'
		)
	})

	it('provides stable Settings and Spotify player routes', () => {
		expect(appRoutes.settings).toBe('/settings')
		expect(apiRoutes.spotifyPlayer).toBe('/api/integrations/spotify/player')
	})
})
