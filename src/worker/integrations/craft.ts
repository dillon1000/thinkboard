import type {
	CraftDocumentBlockUpdate,
	CraftDocumentCandidate,
} from '@agentboard/shared'

const CRAFT_HOSTNAME = 'connect.craft.do'
const CRAFT_REQUEST_TIMEOUT_MS = 15_000
const MAX_CRAFT_JSON_BYTES = 2 * 1_024 * 1_024
const MAX_CRAFT_MARKDOWN_BYTES = 512 * 1_024
// Search context needs enough nearby blocks for precise edits without copying a full large document.
const MAX_CRAFT_CONTEXT_BLOCKS = 20

export interface CraftConnectionSecret {
	apiURL: string
	connectedAt: string
	spaceID: string
	spaceName: string
}

export interface LinkedCraftDocument {
	connectionOwnerID: string
	documentID: string
	id: string
	title: string
}

export interface CraftDocumentContext {
	blocks: CraftEditableTextBlock[]
	linkID: string
	markdown: string
	title: string
}

/** A text block that the model can cite by ID in an explicit update request. */
export interface CraftEditableTextBlock {
	id: string
	markdown: string
}

interface CraftFetchOptions {
	fetcher?: typeof fetch
}

export function normalizeCraftAPIURL(value: string) {
	let url: URL
	try {
		url = new URL(value.trim())
	} catch {
		throw new Error('Enter the API URL from Craft.')
	}
	if (
		url.protocol !== 'https:' ||
		url.hostname.toLowerCase() !== CRAFT_HOSTNAME ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		!/^\/links?\/[^/]+\/api\/v1\/?$/.test(url.pathname)
	) {
		throw new Error('Use a Craft API URL that starts with https://connect.craft.do/link/.')
	}
	return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export async function getCraftConnection(env: Env, userID: string) {
	const value = await env.INTEGRATIONS.get<unknown>(craftConnectionKey(userID), 'json')
	return parseCraftConnection(value)
}

export async function saveCraftConnection(
	env: Env,
	userID: string,
	connection: CraftConnectionSecret
) {
	await env.INTEGRATIONS.put(craftConnectionKey(userID), JSON.stringify(connection))
}

export async function deleteCraftConnection(env: Env, userID: string) {
	await env.INTEGRATIONS.delete(craftConnectionKey(userID))
}

/**
 * Validates a connection URL against Craft before it enters KV. The fixed host and path shape
 * make the saved endpoint safe to use as the base for later server-side requests.
 */
export async function connectCraftAPI(
	apiURL: string,
	options: CraftFetchOptions = {}
): Promise<CraftConnectionSecret> {
	const normalizedURL = normalizeCraftAPIURL(apiURL)
	const data = await requestCraftJSON(
		{ apiURL: normalizedURL },
		'connection',
		undefined,
		options
	)
	const space = readRecord(data)?.space
	const spaceRecord = readRecord(space)
	const spaceID = readString(spaceRecord, 'id')
	const spaceName = readString(spaceRecord, 'name')
	if (!spaceID || !spaceName) throw new Error('Craft returned invalid connection information.')
	return {
		apiURL: normalizedURL,
		connectedAt: new Date().toISOString(),
		spaceID,
		spaceName,
	}
}

export async function listCraftDocumentCandidates(
	connection: CraftConnectionSecret,
	query: string,
	options: CraftFetchOptions = {}
): Promise<CraftDocumentCandidate[]> {
	const data = await requestCraftJSON(
		connection,
		'documents?fetchMetadata=true',
		undefined,
		options
	)
	const documents = readItems(data).flatMap((item): CraftDocumentCandidate[] => {
		const record = readRecord(item)
		const documentID = readString(record, 'id')
		const title = readString(record, 'title')
		if (!documentID || !title) return []
		return [{
			documentID,
			lastModifiedAt: readString(record, 'lastModifiedAt'),
			title,
		}]
	})
	const normalizedQuery = query.trim().toLocaleLowerCase()
	if (!normalizedQuery) return documents.slice(0, 50)

	const titleMatches = documents.filter(({ title }) =>
		title.toLocaleLowerCase().includes(normalizedQuery)
	)
	const searchURL = new URL('documents/search', `${connection.apiURL}/`)
	searchURL.searchParams.set('include', query.trim().slice(0, 500))
	const searchData = await requestCraftJSON(
		connection,
		`${searchURL.pathname.split('/api/v1/')[1]}${searchURL.search}`,
		undefined,
		options
	)
	const matchingIDs = new Set(readItems(searchData).flatMap((item) => {
		const documentID = readString(readRecord(item), 'documentId')
		return documentID ? [documentID] : []
	}))
	return [
		...titleMatches,
		...documents.filter(({ documentID }) =>
			matchingIDs.has(documentID) &&
			!titleMatches.some((candidate) => candidate.documentID === documentID)
		),
	].slice(0, 50)
}

export async function verifyCraftDocument(
	connection: CraftConnectionSecret,
	documentID: string,
	options: CraftFetchOptions = {}
) {
	const parameters = new URLSearchParams({
		id: documentID,
		maxDepth: '0',
	})
	await requestCraftJSON(connection, `blocks?${parameters}`, undefined, options)
}

export async function getCraftDocumentMarkdown(
	connection: CraftConnectionSecret,
	documentID: string,
	options: CraftFetchOptions = {}
) {
	const parameters = new URLSearchParams({ id: documentID })
	const response = await requestCraft(
		connection,
		`blocks?${parameters}`,
		{
			headers: { accept: 'text/markdown' },
		},
		options
	)
	return readLimitedBody(response, MAX_CRAFT_MARKDOWN_BYTES)
}

export async function appendCraftDocumentMarkdown(
	connection: CraftConnectionSecret,
	documentID: string,
	markdown: string,
	options: CraftFetchOptions = {}
) {
	await requestCraftJSON(connection, 'blocks', {
		body: JSON.stringify({
			markdown,
			position: {
				pageId: documentID,
				position: 'end',
			},
		}),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
	}, options)
}

/**
 * Updates text blocks only after a fresh document fetch proves that every supplied ID belongs to
 * the linked document. Craft API connections cover a full space, so this check scopes mutations
 * to the document that the board member selected.
 */
export async function updateCraftDocumentBlocks(
	connection: CraftConnectionSecret,
	documentID: string,
	blocks: readonly CraftDocumentBlockUpdate[],
	options: CraftFetchOptions = {}
) {
	const editableBlocks = await listCraftDocumentEditableBlocks(
		connection,
		documentID,
		options
	)
	const editableBlockIDs = new Set(editableBlocks.map(({ id }) => id))
	const invalidBlock = blocks.find(({ id }) => !editableBlockIDs.has(id))
	if (invalidBlock) {
		throw new Error('A Craft block is not editable in the linked document. Read the document again.')
	}

	await requestCraftJSON(connection, 'blocks', {
		body: JSON.stringify({ blocks }),
		headers: { 'content-type': 'application/json' },
		method: 'PUT',
	}, options)
}

/** Fetches the document tree and returns text blocks with IDs that Craft accepts for updates. */
export async function listCraftDocumentEditableBlocks(
	connection: CraftConnectionSecret,
	documentID: string,
	options: CraftFetchOptions = {}
) {
	const parameters = new URLSearchParams({ id: documentID })
	const data = await requestCraftJSON(
		connection,
		`blocks?${parameters}`,
		undefined,
		options
	)
	return readCraftEditableTextBlocks(data)
}

/**
 * Searches each connection once, limited to the documents that board members explicitly linked.
 * A short full-document fallback keeps broad requests such as “summarize my notes” useful when
 * Craft's relevance search has no literal match.
 */
export async function retrieveLinkedCraftDocuments(
	env: Env,
	links: readonly LinkedCraftDocument[],
	query: string,
	options: CraftFetchOptions = {}
): Promise<CraftDocumentContext[]> {
	const groups = Map.groupBy(links, ({ connectionOwnerID }) => connectionOwnerID)
	const results = await Promise.all([...groups].map(async ([ownerID, ownerLinks]) => {
		const connection = await getCraftConnection(env, ownerID)
		if (!connection) return []

		const searchURL = new URL('documents/search', `${connection.apiURL}/`)
		searchURL.searchParams.set('include', query.trim().slice(0, 500) || ' ')
		searchURL.searchParams.set('fetchBlocks', 'true')
		for (const link of ownerLinks) searchURL.searchParams.append('documentIds', link.documentID)
		const relativeURL = `${searchURL.pathname.split('/api/v1/')[1]}${searchURL.search}`
		const searchData = await requestCraftJSON(
			connection,
			relativeURL,
			undefined,
			options
		).catch(() => null)
		const matches = readItems(searchData).flatMap((item): CraftDocumentContext[] => {
			const record = readRecord(item)
			const documentID = readString(record, 'documentId')
			const markdown = readString(record, 'markdown')
			const link = ownerLinks.find((candidate) => candidate.documentID === documentID)
			return link && markdown
				? [{
						blocks: readCraftEditableTextBlocks(record?.blocks).slice(0, MAX_CRAFT_CONTEXT_BLOCKS),
						linkID: link.id,
						markdown: markdown.slice(0, 8_000),
						title: link.title,
					}]
				: []
		})
		if (matches.length) return matches

		return Promise.all(ownerLinks.slice(0, 3).map(async (link) => {
			const [markdown, blocks] = await Promise.all([
				getCraftDocumentMarkdown(connection, link.documentID, options),
				listCraftDocumentEditableBlocks(connection, link.documentID, options),
			])
			return {
				blocks: blocks.slice(0, MAX_CRAFT_CONTEXT_BLOCKS),
				linkID: link.id,
				markdown: markdown.slice(0, 12_000),
				title: link.title,
			}
		}))
	}))
	return results.flat().slice(0, 8)
}

async function requestCraftJSON(
	connection: Pick<CraftConnectionSecret, 'apiURL'>,
	path: string,
	init?: RequestInit,
	options: CraftFetchOptions = {}
) {
	const response = await requestCraft(
		connection,
		path,
		{
			...init,
			headers: {
				accept: 'application/json',
				...init?.headers,
			},
		},
		options
	)
	const text = await readLimitedBody(response, MAX_CRAFT_JSON_BYTES)
	try {
		return JSON.parse(text) as unknown
	} catch {
		throw new Error('Craft returned an invalid response.')
	}
}

async function requestCraft(
	connection: Pick<CraftConnectionSecret, 'apiURL'>,
	path: string,
	init: RequestInit = {},
	{ fetcher = fetch }: CraftFetchOptions = {}
) {
	const response = await fetcher(new URL(path, `${connection.apiURL}/`), {
		...init,
		signal: AbortSignal.timeout(CRAFT_REQUEST_TIMEOUT_MS),
	})
	if (response.ok) return response

	const message = await readLimitedBody(response, 16_384).catch(() => '')
	if (response.status === 401 || response.status === 403 || response.status === 404) {
		throw new Error('Craft rejected this API connection. Update it in Settings.')
	}
	if (response.status === 429) throw new Error('Craft is receiving too many requests. Try again shortly.')
	throw new Error(readCraftErrorMessage(message) ?? 'Craft is unavailable right now.')
}

async function readLimitedBody(response: Response, maximumBytes: number) {
	const declaredLength = Number(response.headers.get('content-length'))
	if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
		throw new Error('Craft returned more document content than Agentboard can safely read.')
	}
	if (!response.body) return ''

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let bytesRead = 0
	let text = ''
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			bytesRead += value.byteLength
			if (bytesRead > maximumBytes) {
				await reader.cancel()
				throw new Error('Craft returned more document content than Agentboard can safely read.')
			}
			text += decoder.decode(value, { stream: true })
		}
		return text + decoder.decode()
	} finally {
		reader.releaseLock()
	}
}

function craftConnectionKey(userID: string) {
	return `user:${userID}:integration:craft:v1`
}

function parseCraftConnection(value: unknown): CraftConnectionSecret | null {
	const record = readRecord(value)
	const apiURL = readString(record, 'apiURL')
	const connectedAt = readString(record, 'connectedAt')
	const spaceID = readString(record, 'spaceID')
	const spaceName = readString(record, 'spaceName')
	return apiURL && connectedAt && spaceID && spaceName
		? { apiURL, connectedAt, spaceID, spaceName }
		: null
}

function readCraftErrorMessage(value: string) {
	try {
		const data = readRecord(JSON.parse(value))
		return readString(data, 'error') ?? readString(data, 'message')
	} catch {
		return null
	}
}

function readItems(value: unknown) {
	const items = readRecord(value)?.items
	return Array.isArray(items) ? items : []
}

function readCraftEditableTextBlocks(value: unknown) {
	const blocks: CraftEditableTextBlock[] = []
	const visit = (candidate: unknown) => {
		if (Array.isArray(candidate)) {
			for (const item of candidate) visit(item)
			return
		}
		const record = readRecord(candidate)
		if (!record) return
		const id = readString(record, 'id')
		const type = readString(record, 'type')
		const markdown = readStringValue(record, 'markdown')
		if (id && type === 'text' && markdown !== null) blocks.push({ id, markdown })
		visit(record.content)
	}
	visit(value)
	return blocks
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null
}

function readString(value: Record<string, unknown> | null, key: string): string | null {
	const field = value?.[key]
	return typeof field === 'string' && field.trim() ? field : null
}

function readStringValue(value: Record<string, unknown> | null, key: string): string | null {
	const field = value?.[key]
	return typeof field === 'string' ? field : null
}
