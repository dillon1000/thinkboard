import { describe, expect, it } from 'vitest'
import { attachCraftDocumentContext } from './craftContext'

describe('attachCraftDocumentContext', () => {
	it('adds a cited linked document to the latest user message', () => {
		const result = attachCraftDocumentContext(
			[{ role: 'user', content: 'Summarize the unit' }],
			[{
				blocks: [{ id: 'block-1', markdown: 'Force equals mass times acceleration.' }],
				linkID: 'link-1',
				markdown: '# Forces',
				title: 'Physics notes',
			}]
		)

		expect(result[0]).toMatchObject({
			role: 'user',
			content: [
				{ type: 'text', text: 'Summarize the unit' },
				{
					type: 'text',
					text: expect.stringContaining('[Physics notes](#craft-document=link-1)'),
				},
			],
		})
		expect(JSON.stringify(result[0])).toContain('block-1')
	})
})
