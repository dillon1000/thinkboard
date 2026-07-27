import { describe, expect, it } from 'vitest'
import { attachCraftDocumentContext } from './craftContext'

describe('attachCraftDocumentContext', () => {
	it('adds a cited linked document to the latest user message', () => {
		const result = attachCraftDocumentContext(
			[{ role: 'user', content: 'Summarize the unit' }],
			[{ linkID: 'link-1', markdown: '# Forces', title: 'Physics notes' }]
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
	})
})
