import { describe, expect, it } from 'vitest'
import { getMessageCopyText } from './studyMessageActions'

describe('getMessageCopyText', () => {
	it('joins visible text parts in reading order', () => {
		expect(getMessageCopyText([
			{ type: 'text', text: 'First paragraph.' },
			{ type: 'text', text: 'Second paragraph.' },
		])).toBe('First paragraph.\n\nSecond paragraph.')
	})

	it('excludes reasoning, files, and tool payloads', () => {
		expect(getMessageCopyText([
			{ type: 'reasoning', text: 'Private reasoning' },
			{ type: 'file' },
			{ type: 'tool-composeCanvas' },
			{ type: 'text', text: 'Visible answer' },
		])).toBe('Visible answer')
	})
})
