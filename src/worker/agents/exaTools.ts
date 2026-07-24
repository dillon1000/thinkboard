import { tool } from 'ai'
import { z } from 'zod'

const EXA_API_ORIGIN = 'https://api.exa.ai'
const DEFAULT_SEARCH_RESULTS = 5
const DEFAULT_CRAWL_CHARACTERS = 12_000
const SEARCH_DESCRIPTION = 'Search the public web for current or external information. Returns relevant excerpts and source URLs. Use this when the answer depends on facts beyond the board or may have changed.'
const ANSWER_DESCRIPTION = 'Get a web-grounded answer with citations from Exa. Use this for a specific factual question or open-ended research request that needs a synthesized answer from current sources.'
const CRAWL_DESCRIPTION = 'Retrieve readable page text and metadata from one to three specific public URLs. Use this when the student supplies a URL or a search result needs to be read in depth.'

const exaCategorySchema = z.enum([
	'company',
	'people',
	'publication',
	'news',
	'personal site',
	'financial report',
])

const domainListSchema = z.array(
	z.string().trim().min(1).max(253)
).max(10)

const publishedDateSchema = z.string().trim().min(4).max(35)

const httpURLSchema = z.url().max(2_048).refine((value) => {
	const protocol = new URL(value).protocol
	return protocol === 'http:' || protocol === 'https:'
}, 'Use an HTTP or HTTPS URL')

export const exaSearchInputSchema = z.object({
	query: z.string().trim().min(1).max(2_000)
		.describe('A natural-language web search query. Preserve the important context from the student’s request.'),
	numResults: z.number().int().min(1).max(10).default(DEFAULT_SEARCH_RESULTS)
		.describe('The number of results to return. Use five unless the task needs broader coverage.'),
	category: exaCategorySchema.optional()
		.describe('An optional Exa index to use when the request clearly targets one content category.'),
	includeDomains: domainListSchema.optional()
		.describe('Optional domains or path prefixes that results must come from, without site: operators.'),
	excludeDomains: domainListSchema.optional()
		.describe('Optional domains or path prefixes to exclude. Do not combine with company or people categories.'),
	startPublishedDate: publishedDateSchema.optional()
		.describe('Optional ISO 8601 lower publication-date bound.'),
	endPublishedDate: publishedDateSchema.optional()
		.describe('Optional ISO 8601 upper publication-date bound.'),
})

export const exaAnswerInputSchema = z.object({
	query: z.string().trim().min(1).max(2_000)
		.describe('The specific question or research instruction to answer from web sources.'),
})

export const exaCrawlInputSchema = z.object({
	urls: z.array(httpURLSchema).min(1).max(3)
		.describe('One to three public webpages to retrieve.'),
	maxCharacters: z.number().int().min(1_000).max(20_000).default(DEFAULT_CRAWL_CHARACTERS)
		.describe('Maximum extracted text characters to return for each webpage.'),
})

const exaResultSchema = z.object({
	id: z.string().optional(),
	title: z.string().nullish(),
	url: z.string(),
	publishedDate: z.string().nullish(),
	author: z.string().nullish(),
	text: z.string().optional(),
	highlights: z.array(z.string()).optional(),
})

const exaStatusSchema = z.object({
	id: z.string(),
	status: z.string(),
	source: z.string().optional(),
})

const exaSearchAPIResponseSchema = z.object({
	results: z.array(exaResultSchema),
})

const exaAnswerAPIResponseSchema = z.object({
	answer: z.string(),
	citations: z.array(exaResultSchema).default([]),
})

const exaContentsAPIResponseSchema = z.object({
	results: z.array(exaResultSchema),
	statuses: z.array(exaStatusSchema).default([]),
})

export const exaSourceSchema = z.object({
	title: z.string(),
	url: z.string(),
	publishedDate: z.string().optional(),
	author: z.string().optional(),
	highlights: z.array(z.string()).optional(),
	text: z.string().optional(),
})

export const exaSearchOutputSchema = z.object({
	results: z.array(exaSourceSchema),
})

export const exaAnswerOutputSchema = z.object({
	answer: z.string(),
	citations: z.array(exaSourceSchema),
})

export const exaCrawlOutputSchema = z.object({
	results: z.array(exaSourceSchema),
	statuses: z.array(exaStatusSchema),
})

export type ExaSearchInput = z.infer<typeof exaSearchInputSchema>
export type ExaAnswerInput = z.infer<typeof exaAnswerInputSchema>
export type ExaCrawlInput = z.infer<typeof exaCrawlInputSchema>
export type ExaSearchOutput = z.infer<typeof exaSearchOutputSchema>
export type ExaAnswerOutput = z.infer<typeof exaAnswerOutputSchema>
export type ExaCrawlOutput = z.infer<typeof exaCrawlOutputSchema>

type Fetcher = typeof fetch

export async function searchExa(
	apiKey: string,
	input: ExaSearchInput,
	fetcher: Fetcher = fetch,
	signal?: AbortSignal
): Promise<ExaSearchOutput> {
	const response = await postExa(
		apiKey,
		'/search',
		{
			...input,
			type: 'auto',
			moderation: true,
			contents: {
				highlights: true,
			},
		},
		exaSearchAPIResponseSchema,
		fetcher,
		signal
	)

	return {
		results: response.results.map(normalizeSource),
	}
}

export async function answerExa(
	apiKey: string,
	input: ExaAnswerInput,
	fetcher: Fetcher = fetch,
	signal?: AbortSignal
): Promise<ExaAnswerOutput> {
	const response = await postExa(
		apiKey,
		'/answer',
		{
			query: input.query,
			text: false,
		},
		exaAnswerAPIResponseSchema,
		fetcher,
		signal
	)

	return {
		answer: response.answer,
		citations: response.citations.map(normalizeSource),
	}
}

export async function crawlExa(
	apiKey: string,
	input: ExaCrawlInput,
	fetcher: Fetcher = fetch,
	signal?: AbortSignal
): Promise<ExaCrawlOutput> {
	const response = await postExa(
		apiKey,
		'/contents',
		{
			urls: input.urls,
			text: {
				maxCharacters: input.maxCharacters,
			},
		},
		exaContentsAPIResponseSchema,
		fetcher,
		signal
	)

	return {
		results: response.results.map(normalizeSource),
		statuses: response.statuses,
	}
}

export function createExaTools(apiKey?: string, fetcher: Fetcher = fetch) {
	const normalizedAPIKey = apiKey?.trim()
	if (!normalizedAPIKey) {
		return {
			search: tool({
				description: SEARCH_DESCRIPTION,
				inputSchema: exaSearchInputSchema,
				outputSchema: exaSearchOutputSchema,
			}),
			answer: tool({
				description: ANSWER_DESCRIPTION,
				inputSchema: exaAnswerInputSchema,
				outputSchema: exaAnswerOutputSchema,
			}),
			crawl: tool({
				description: CRAWL_DESCRIPTION,
				inputSchema: exaCrawlInputSchema,
				outputSchema: exaCrawlOutputSchema,
			}),
		}
	}

	return {
		search: tool({
			description: SEARCH_DESCRIPTION,
			inputSchema: exaSearchInputSchema,
			outputSchema: exaSearchOutputSchema,
			execute: (input, { abortSignal }) =>
				searchExa(normalizedAPIKey, input, fetcher, abortSignal),
		}),
		answer: tool({
			description: ANSWER_DESCRIPTION,
			inputSchema: exaAnswerInputSchema,
			outputSchema: exaAnswerOutputSchema,
			execute: (input, { abortSignal }) =>
				answerExa(normalizedAPIKey, input, fetcher, abortSignal),
		}),
		crawl: tool({
			description: CRAWL_DESCRIPTION,
			inputSchema: exaCrawlInputSchema,
			outputSchema: exaCrawlOutputSchema,
			execute: (input, { abortSignal }) =>
				crawlExa(normalizedAPIKey, input, fetcher, abortSignal),
		}),
	}
}

async function postExa<Schema extends z.ZodType>(
	apiKey: string,
	path: string,
	body: unknown,
	schema: Schema,
	fetcher: Fetcher,
	signal?: AbortSignal
): Promise<z.infer<Schema>> {
	const response = await fetcher(`${EXA_API_ORIGIN}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
		},
		body: JSON.stringify(body),
		signal,
	})

	if (!response.ok) {
		const detail = (await response.text()).trim().slice(0, 500)
		throw new Error(
			`Exa request failed with status ${response.status}${detail ? `: ${detail}` : ''}`
		)
	}

	const data: unknown = await response.json()
	const parsed = schema.safeParse(data)
	if (!parsed.success) {
		throw new Error('Exa returned an invalid response')
	}
	return parsed.data
}

function normalizeSource(source: z.infer<typeof exaResultSchema>) {
	return {
		title: source.title?.trim() || source.url,
		url: source.url,
		...(source.publishedDate ? { publishedDate: source.publishedDate } : {}),
		...(source.author ? { author: source.author } : {}),
		...(source.highlights ? { highlights: source.highlights } : {}),
		...(source.text ? { text: source.text } : {}),
	}
}
