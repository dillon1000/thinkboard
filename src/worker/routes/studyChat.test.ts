import { describe, expect, it, vi } from 'vitest'
import { forwardStudyAgentRequest } from './studyChat'

describe('forwardStudyAgentRequest', () => {
	it('forwards a request URL and init separately to the Durable Object stub', async () => {
		const response = Response.json({ messages: [] })
		const fetch = vi.fn(async () => response)
		const request = new Request(
			'https://board.example/api/boards/board-1/conversations/conversation-1/messages',
			{
				body: JSON.stringify({ messages: [] }),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			}
		)

		await expect(forwardStudyAgentRequest({ fetch }, request)).resolves.toBe(response)
		expect(fetch).toHaveBeenCalledWith(request.url, {
			body: request.body,
			headers: request.headers,
			method: 'POST',
			signal: request.signal,
		})
	})

	it('overwrites internal learning-history identity headers', async () => {
		const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
			Response.json({ messages: [] }))
		const request = new Request('https://board.example/messages', {
			headers: { 'x-agentboard-user-id': 'forged' },
		})
		await forwardStudyAgentRequest({ fetch }, request, { boardID: 'board-1', userID: 'user-1' })
		const init = fetch.mock.calls[0]?.[1]
		const headers = new Headers(init?.headers)
		expect(headers.get('x-agentboard-user-id')).toBe('user-1')
		expect(headers.get('x-agentboard-board-id')).toBe('board-1')
	})
})
