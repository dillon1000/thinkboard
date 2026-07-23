import { describe, expect, it } from 'vitest'
import { chunkPageText } from './pipeline'

describe('chunkPageText', () => {
	it('keeps chunks within a single page and under the configured maximum', () => {
		const paragraphs = Array.from({ length: 30 }, (_, index) =>
			`Paragraph ${index + 1}. ${'A detailed sentence about the course material. '.repeat(12)}`
		)
		const chunks = chunkPageText(paragraphs.join('\n\n'))

		expect(chunks.length).toBeGreaterThan(1)
		expect(chunks.every((chunk) => chunk.length <= 3_200)).toBe(true)
		expect(chunks.join('\n\n')).toContain('Paragraph 1')
		expect(chunks.join('\n\n')).toContain('Paragraph 30')
	})

	it('does not create a vector chunk for an empty page', () => {
		expect(chunkPageText('   \n\n ')).toEqual([])
	})
})
