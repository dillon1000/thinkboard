import { describe, expect, it } from 'vitest'
import {
	getClickablePDFURL,
	isPDFCopyShortcut,
	isPDFInteractionTool,
	shouldEnablePDFPageInteraction,
} from './PDFPageInteractiveLayer'

describe('getClickablePDFURL', () => {
	it('allows web, email, and telephone links', () => {
		expect(getClickablePDFURL('https://example.com/notes?q=pdf')).toBe(
			'https://example.com/notes?q=pdf'
		)
		expect(getClickablePDFURL('mailto:reader@example.com')).toBe(
			'mailto:reader@example.com'
		)
		expect(getClickablePDFURL('tel:+15551234567')).toBe('tel:+15551234567')
	})

	it('rejects executable and malformed link targets', () => {
		expect(getClickablePDFURL('javascript:alert(1)')).toBeNull()
		expect(getClickablePDFURL('data:text/html,hello')).toBeNull()
		expect(getClickablePDFURL('not a URL')).toBeNull()
	})
})

describe('isPDFCopyShortcut', () => {
	it('recognizes the standard Command and Control copy shortcuts', () => {
		expect(isPDFCopyShortcut({
			altKey: false,
			ctrlKey: false,
			key: 'c',
			metaKey: true,
			shiftKey: false,
		})).toBe(true)
		expect(isPDFCopyShortcut({
			altKey: false,
			ctrlKey: true,
			key: 'C',
			metaKey: false,
			shiftKey: false,
		})).toBe(true)
	})

	it('leaves other canvas shortcuts untouched', () => {
		expect(isPDFCopyShortcut({
			altKey: false,
			ctrlKey: false,
			key: 'c',
			metaKey: false,
			shiftKey: false,
		})).toBe(false)
		expect(isPDFCopyShortcut({
			altKey: false,
			ctrlKey: true,
			key: 'c',
			metaKey: false,
			shiftKey: true,
		})).toBe(false)
	})
})

describe('isPDFInteractionTool', () => {
	it('enables selectable text and links only for the cursor tool', () => {
		expect(isPDFInteractionTool('select')).toBe(true)
		expect(isPDFInteractionTool('draw')).toBe(false)
		expect(isPDFInteractionTool('eraser')).toBe(false)
		expect(isPDFInteractionTool('hand')).toBe(false)
	})
})

describe('shouldEnablePDFPageInteraction', () => {
	it('defers text and link rendering while a page is small on screen', () => {
		expect(shouldEnablePDFPageInteraction({
			isSelected: false,
			screenWidth: 240,
		})).toBe(false)
		expect(shouldEnablePDFPageInteraction({
			isSelected: false,
			screenWidth: 420,
		})).toBe(true)
	})

	it('enables interaction for an explicitly selected page at any zoom', () => {
		expect(shouldEnablePDFPageInteraction({
			isSelected: true,
			screenWidth: 12,
		})).toBe(true)
	})
})
