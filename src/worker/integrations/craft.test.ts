import { createCraftWhiteboardRevision } from '@agentboard/shared'
import { describe, expect, it, vi } from 'vitest'
import {
	connectCraftAPI,
	getCraftWhiteboard,
	listCraftDocumentEditableBlocks,
	listCraftDocumentCandidates,
	listCraftDocumentWhiteboards,
	normalizeCraftAPIURL,
	retrieveLinkedCraftDocuments,
	saveCraftWhiteboard,
	updateCraftDocumentBlocks,
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

describe('Craft block editing', () => {
	const connection = {
		apiURL: 'https://connect.craft.do/link/secret/api/v1',
		connectedAt: new Date(0).toISOString(),
		spaceID: 'space-1',
		spaceName: 'Study',
	}

	it('finds nested editable text blocks', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
			id: 'document-1',
			type: 'page',
			content: [{
				id: 'heading-1',
				type: 'text',
				markdown: '# Unit one',
			}, {
				id: 'page-1',
				type: 'page',
				content: [{
					id: 'body-1',
					type: 'text',
					markdown: 'Original explanation.',
				}],
			}],
		}))

		expect(await listCraftDocumentEditableBlocks(
			connection,
			'document-1',
			{ fetcher }
		)).toEqual([
			{ id: 'heading-1', markdown: '# Unit one' },
			{ id: 'body-1', markdown: 'Original explanation.' },
		])
	})

	it('updates only text blocks from the linked document', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({
				id: 'document-1',
				type: 'page',
				content: [{
					id: 'body-1',
					type: 'text',
					markdown: 'Original explanation.',
				}],
			}))
			.mockResolvedValueOnce(Response.json({
				items: [{
					id: 'body-1',
					type: 'text',
					markdown: 'Corrected explanation.',
				}],
			}))

		await updateCraftDocumentBlocks(
			connection,
			'document-1',
			[{ id: 'body-1', markdown: 'Corrected explanation.' }],
			{ fetcher }
		)

		expect(String(fetcher.mock.calls[1][0])).toBe(
			'https://connect.craft.do/link/secret/api/v1/blocks'
		)
		expect(fetcher.mock.calls[1][1]).toMatchObject({
			body: JSON.stringify({
				blocks: [{ id: 'body-1', markdown: 'Corrected explanation.' }],
			}),
			method: 'PUT',
		})
	})

	it('rejects block IDs outside the linked document', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
			id: 'document-1',
			type: 'page',
			content: [{
				id: 'body-1',
				type: 'text',
				markdown: 'Original explanation.',
			}],
		}))

		await expect(updateCraftDocumentBlocks(
			connection,
			'document-1',
			[{ id: 'other-document-block', markdown: 'Changed.' }],
			{ fetcher }
		)).rejects.toThrow('not editable in the linked document')
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it('requests block IDs for linked document search context', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
			items: [{
				documentId: 'document-1',
				markdown: 'Matched explanation.',
				blocks: [{
					id: 'body-1',
					type: 'text',
					markdown: 'Matched explanation.',
				}],
			}],
		}))
		const env = {
			INTEGRATIONS: {
				get: vi.fn().mockResolvedValue(connection),
			},
		} as unknown as Env

		expect(await retrieveLinkedCraftDocuments(
			env,
			[{
				connectionOwnerID: 'user-1',
				documentID: 'document-1',
				id: 'link-1',
				title: 'Study',
			}],
			'explanation',
			{ fetcher }
		)).toEqual([{
			blocks: [{ id: 'body-1', markdown: 'Matched explanation.' }],
			linkID: 'link-1',
			markdown: 'Matched explanation.',
			title: 'Study',
		}])
		expect(String(fetcher.mock.calls[0][0])).toContain('fetchBlocks=true')
	})
})

describe('Craft whiteboards', () => {
	const connection = {
		apiURL: 'https://connect.craft.do/link/secret/api/v1',
		connectedAt: new Date(0).toISOString(),
		spaceID: 'space-1',
		spaceName: 'Study',
	}
	const documentBlocks = {
		id: 'document-1',
		type: 'page',
		content: [{
			id: 'section-1',
			type: 'page',
			content: [{
				id: 'whiteboard-1',
				type: 'whiteboard',
				title: 'Cell map',
			}],
		}],
	}

	it('discovers nested whiteboard blocks in one document', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(documentBlocks))

		expect(await listCraftDocumentWhiteboards(
			connection,
			'document-1',
			{ fetcher }
		)).toEqual([{
			documentID: 'document-1',
			title: 'Cell map',
			whiteboardBlockID: 'whiteboard-1',
		}])
	})

	it('fetches Excalidraw content after it verifies the document boundary', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json(documentBlocks))
			.mockResolvedValueOnce(Response.json({
				appState: { viewBackgroundColor: '#ffffff' },
				assets: {},
				elements: [{
					id: 'element-1',
					type: 'rectangle',
					x: 10,
					y: 20,
				}],
			}))

		const whiteboard = await getCraftWhiteboard(
			connection,
			'document-1',
			'whiteboard-1',
			{ fetcher }
		)
		expect(whiteboard).toMatchObject({
			documentID: 'document-1',
			elements: [{ id: 'element-1', type: 'rectangle' }],
			title: 'Cell map',
			whiteboardBlockID: 'whiteboard-1',
		})
		expect(whiteboard.revision).toMatch(/^[a-f0-9]{64}$/)
		expect(String(fetcher.mock.calls[1][0])).toBe(
			'https://connect.craft.do/link/secret/api/v1/whiteboards/whiteboard-1/elements'
		)
	})

	it('updates, adds, and deletes only the changed element IDs', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json(documentBlocks))
			.mockResolvedValueOnce(Response.json({
				elements: [
					{ id: 'old-1', type: 'rectangle' },
					{ id: 'kept-1', type: 'ellipse' },
				],
			}))
			.mockResolvedValueOnce(Response.json({ elements: [] }))
			.mockResolvedValueOnce(Response.json({ elements: [] }))
			.mockResolvedValueOnce(Response.json({ deletedCount: 1 }))
			.mockResolvedValueOnce(Response.json({
				elements: [
					{ id: 'kept-1', type: 'ellipse', x: 20 },
					{ id: 'new-1', type: 'rectangle' },
				],
			}))

		const result = await saveCraftWhiteboard(
			connection,
			'document-1',
			'whiteboard-1',
			[{ id: 'new-1', type: 'rectangle' }],
			[{ id: 'kept-1', type: 'ellipse', x: 20 }],
			['old-1'],
			await createCraftWhiteboardRevision([
				{ id: 'old-1', type: 'rectangle' },
				{ id: 'kept-1', type: 'ellipse' },
			]),
			{ fetcher }
		)

		expect(fetcher.mock.calls.slice(1).map(([, init]) => init?.method)).toEqual([
			undefined,
			'PUT',
			'POST',
			'DELETE',
			undefined,
		])
		expect(fetcher.mock.calls[4][1]?.body).toBe(JSON.stringify({
			elementIds: ['old-1'],
		}))
		expect(result).toMatchObject({ added: 1, deleted: 1, updated: 1 })
		expect(result.revision).toMatch(/^[a-f0-9]{64}$/)
	})

	it('stops a save when Craft changed after the last sync', async () => {
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json(documentBlocks))
			.mockResolvedValueOnce(Response.json({
				elements: [{ id: 'remote-change', type: 'ellipse' }],
			}))

		await expect(saveCraftWhiteboard(
			connection,
			'document-1',
			'whiteboard-1',
			[{ id: 'local-change', type: 'rectangle' }],
			[],
			['old-1'],
			'a'.repeat(64),
			{ fetcher }
		)).rejects.toThrow('Choose which copy to keep')
		expect(fetcher).toHaveBeenCalledTimes(2)
	})
})
