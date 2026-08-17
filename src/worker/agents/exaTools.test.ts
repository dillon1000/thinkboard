import { describe, expect, it } from 'vitest'
import {
	answerExa,
	crawlExa,
	exaCrawlInputSchema,
	searchExa,
} from './exaTools'

describe('Exa tools', () => {
	it('searches with bounded highlights and source filters', async () => {
		let capturedURL = ''
		let capturedInit: RequestInit | undefined
		const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
			capturedURL = String(input)
			capturedInit = init
			return Response.json({
				results: [{
					id: 'https://example.com/result',
					title: 'Example result',
					url: 'https://example.com/result',
					publishedDate: '2026-07-22',
					highlights: ['A relevant excerpt.'],
				}],
			})
		}

		const result = await searchExa('test-key', {
			query: 'latest example',
			numResults: 5,
			category: 'news',
			includeDomains: ['example.com'],
		}, fetcher)

		expect(capturedURL).toBe('https://api.exa.ai/search')
		expect(capturedInit?.method).toBe('POST')
		expect(new Headers(capturedInit?.headers).get('x-api-key')).toBe('test-key')
		expect(JSON.parse(String(capturedInit?.body))).toEqual({
			query: 'latest example',
			numResults: 5,
			category: 'news',
			includeDomains: ['example.com'],
			type: 'auto',
			moderation: true,
			contents: { highlights: true },
		})
		expect(result).toEqual({
			results: [{
				title: 'Example result',
				url: 'https://example.com/result',
				publishedDate: '2026-07-22',
				highlights: ['A relevant excerpt.'],
			}],
		})
	})

	it('returns a grounded answer and normalized citations', async () => {
		let capturedInit: RequestInit | undefined
		const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
			capturedInit = init
			return Response.json({
				answer: 'The sourced answer.',
				citations: [{
					title: null,
					url: 'https://example.com/source',
					author: 'Example Author',
				}],
			})
		}

		const result = await answerExa(
			'test-key',
			{ query: 'What happened?' },
			fetcher
		)

		expect(JSON.parse(String(capturedInit?.body))).toEqual({
			query: 'What happened?',
			text: false,
		})
		expect(result).toEqual({
			answer: 'The sourced answer.',
			citations: [{
				title: 'https://example.com/source',
				url: 'https://example.com/source',
				author: 'Example Author',
			}],
		})
	})

	it('crawls specific webpages with a character cap', async () => {
		let capturedURL = ''
		let capturedInit: RequestInit | undefined
		const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
			capturedURL = String(input)
			capturedInit = init
			return Response.json({
				results: [{
					title: 'Example page',
					url: 'https://example.com/page',
					text: 'Readable page text.',
				}],
				statuses: [{
					id: 'https://example.com/page',
					status: 'success',
					source: 'livecrawl',
				}],
			})
		}

		const result = await crawlExa('test-key', {
			urls: ['https://example.com/page'],
			maxCharacters: 8_000,
		}, fetcher)

		expect(capturedURL).toBe('https://api.exa.ai/contents')
		expect(JSON.parse(String(capturedInit?.body))).toEqual({
			urls: ['https://example.com/page'],
			text: { maxCharacters: 8_000 },
		})
		expect(result.results[0]?.text).toBe('Readable page text.')
		expect(result.statuses[0]).toEqual({
			id: 'https://example.com/page',
			status: 'success',
			source: 'livecrawl',
		})
	})

	it('rejects non-web crawl URLs', () => {
		expect(exaCrawlInputSchema.safeParse({
			urls: ['file:///etc/passwd'],
			maxCharacters: 5_000,
		}).success).toBe(false)
	})

	it('surfaces Exa HTTP failures without leaking unbounded response bodies', async () => {
		const fetcher = async () => new Response('invalid request', { status: 422 })

		await expect(answerExa(
			'test-key',
			{ query: 'Question' },
			fetcher
		)).rejects.toThrow('Exa request failed with status 422: invalid request')
	})
})
