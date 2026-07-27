import { describe, expect, it, vi } from 'vitest'
import {
	connectCraftAPI,
	listCraftDocumentCandidates,
	normalizeCraftAPIURL,
} from './craft'

describe('normalizeCraftAPIURL', () => {
	it('accepts Craft link and links API URLs and removes the trailing slash', () => {
		expect(normalizeCraftAPIURL(
			'https://connect.craft.do/link/secret-value/api/v1/'
		)).toBe('https://connect.craft.do/link/secret-value/api/v1')
		expect(normalizeCraftAPIURL(
			'https://connect.craft.do/links/secret-value/api/v1'
		)).toBe('https://connect.craft.do/links/secret-value/api/v1')
	})

	it('rejects URLs that could send the saved credential request to another host', () => {
		expect(() => normalizeCraftAPIURL(
			'https://connect.craft.do.example/link/secret/api/v1'
		)).toThrow('Use a Craft API URL')
		expect(() => normalizeCraftAPIURL(
			'https://connect.craft.do/link/secret/api/v1?next=https://example.com'
		)).toThrow('Use a Craft API URL')
	})
})

describe('connectCraftAPI', () => {
	it('checks the connection and keeps the normalized URL', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
			space: {
				id: 'space-1',
				name: 'Study space',
			},
		}))

		const result = await connectCraftAPI(
			'https://connect.craft.do/link/secret/api/v1/',
			{ fetcher }
		)

		expect(result).toMatchObject({
			apiURL: 'https://connect.craft.do/link/secret/api/v1',
			spaceID: 'space-1',
			spaceName: 'Study space',
		})
		expect(String(fetcher.mock.calls[0][0])).toBe(
			'https://connect.craft.do/link/secret/api/v1/connection'
		)
	})
})

describe('listCraftDocumentCandidates', () => {
	it('combines title and content matches without duplicate documents', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({
				items: [
					{ id: 'doc-1', title: 'Physics review' },
					{ id: 'doc-2', title: 'Lab notebook' },
				],
			}))
			.mockResolvedValueOnce(Response.json({
				items: [
					{ documentId: 'doc-1', markdown: 'physics' },
					{ documentId: 'doc-2', markdown: 'physics' },
				],
			}))

		const result = await listCraftDocumentCandidates({
			apiURL: 'https://connect.craft.do/link/secret/api/v1',
			connectedAt: new Date(0).toISOString(),
			spaceID: 'space-1',
			spaceName: 'Study',
		}, 'physics', { fetcher })

		expect(result.map(({ documentID }) => documentID)).toEqual(['doc-1', 'doc-2'])
	})
})
