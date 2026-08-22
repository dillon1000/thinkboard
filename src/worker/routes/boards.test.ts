import { describe, expect, it } from 'vitest'
import { readBoardCreateInput } from './boards'

describe('readBoardCreateInput', () => {
	it('accepts page-based note-taking spaces', async () => {
		const request = new Request('https://example.com/api/boards', {
			body: JSON.stringify({
				noteMode: 'pages',
				pageTexture: 'grid',
				title: '  Biology   notes  ',
			}),
			method: 'POST',
		})

		await expect(readBoardCreateInput(request)).resolves.toEqual({
			noteMode: 'pages',
			pageTexture: 'grid',
			title: 'Biology notes',
		})
	})

	it('defaults older create requests to an infinite canvas', async () => {
		const request = new Request('https://example.com/api/boards', {
			body: JSON.stringify({ title: 'Physics' }),
			method: 'POST',
		})

		await expect(readBoardCreateInput(request)).resolves.toEqual({
			noteMode: 'canvas',
			pageTexture: 'blank',
			title: 'Physics',
		})
	})
})
