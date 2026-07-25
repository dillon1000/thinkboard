import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReasoningTrail } from './ReasoningTrail'

describe('ReasoningTrail', () => {
	it('keeps the reasoning text collapsed by default', () => {
		const markup = renderToStaticMarkup(
			createElement(ReasoningTrail, {
				isStreaming: false,
				text: 'Check the distance before comparing travel time.',
			})
		)

		expect(markup).toContain('aria-expanded="false"')
		expect(markup).toContain('Reasoning trace')
		expect(markup).not.toContain('Check the distance')
	})

	it('stays collapsed while reasoning streams', () => {
		const markup = renderToStaticMarkup(
			createElement(ReasoningTrail, {
				isStreaming: true,
				text: 'Comparing the available options.',
			})
		)

		expect(markup).toContain('aria-expanded="false"')
		expect(markup).not.toContain('Comparing the available options')
	})
})
