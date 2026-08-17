import { hasObjectType, isBoolean, isNumber, isString } from '@agentboard/shared'
import {
	spotifyPlaybackActionSchema,
	type SpotifyAgentPlayOutput,
	type SpotifyPlayback,
	type SpotifyPlaybackItem,
	type SpotifyPlayerResponse,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { createAuth, getSpotifyConfiguration } from '../auth/createAuth'
import { requireSession } from '../auth/session'

const SPOTIFY_PLAYER_URL = 'https://api.spotify.com/v1/me/player'
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search'

export async function handleSpotifyPlayerGet(request: IRequest, env: Env) {
	const connection = await getSpotifyConnection(request, env)
	if ('response' in connection) return connection.response
	if (!connection.accessToken) return spotifyPlayerResponse(connection.configured, false, null)

	const response = await fetch(`${SPOTIFY_PLAYER_URL}?additional_types=track,episode`, {
		headers: {
			authorization: `Bearer ${connection.accessToken}`,
		},
	})

	if (response.status === 204) {
		return spotifyPlayerResponse(true, true, null)
	}
	if (!response.ok) return spotifyAPIErrorResponse(response)

	const data: unknown = await response.json()
	return spotifyPlayerResponse(true, true, parseSpotifyPlayback(data))
}

export async function handleSpotifyPlayerAction(request: IRequest, env: Env) {
	const input: unknown = await request.json().catch(() => null)
	const parsed = spotifyPlaybackActionSchema.safeParse(input)
	if (!parsed.success) {
		return Response.json({ error: 'Choose a valid Spotify playback action' }, { status: 400 })
	}

	const connection = await getSpotifyConnection(request, env)
	if ('response' in connection) return connection.response
	if (!connection.configured) {
		return Response.json({ error: 'Spotify is not configured' }, { status: 503 })
	}
	if (!connection.accessToken) {
		return Response.json({ error: 'Connect Spotify in Settings to use the player' }, { status: 409 })
	}

	const actionRequest = getSpotifyActionRequest(parsed.data.action)
	const response = await fetch(`${SPOTIFY_PLAYER_URL}${actionRequest.path}`, {
		method: actionRequest.method,
		headers: {
			authorization: `Bearer ${connection.accessToken}`,
		},
	})

	if (!response.ok) return spotifyAPIErrorResponse(response)
	return Response.json({ ok: true })
}

export async function getSpotifyPlaybackForAgent(
	request: Request,
	env: Env
): Promise<SpotifyPlayback | null | undefined> {
	const accessToken = await getSpotifyAccessTokenForAgent(request, env)
	if (!accessToken) return undefined

	const response = await fetch(`${SPOTIFY_PLAYER_URL}?additional_types=track,episode`, {
		headers: {
			authorization: `Bearer ${accessToken}`,
		},
	})
	if (response.status === 204) return null
	if (!response.ok) return undefined

	const data: unknown = await response.json()
	return parseSpotifyPlayback(data)
}

export async function playSpotifyForAgent(
	request: Request,
	env: Env,
	query: string
): Promise<SpotifyAgentPlayOutput> {
	const accessToken = await getSpotifyAccessTokenForAgent(request, env)
	if (!accessToken) {
		throw new Error('Spotify is not connected. Connect or update access in Settings.')
	}

	const searchURL = new URL(SPOTIFY_SEARCH_URL)
	searchURL.searchParams.set('q', query)
	searchURL.searchParams.set('type', 'track')
	searchURL.searchParams.set('limit', '1')
	const searchResponse = await fetch(searchURL, {
		headers: {
			authorization: `Bearer ${accessToken}`,
		},
	})
	if (!searchResponse.ok) {
		throw new Error(await spotifyAgentErrorMessage(searchResponse))
	}

	const searchData: unknown = await searchResponse.json()
	const track = parseSpotifySearchTrack(searchData)
	if (!track) throw new Error(`No Spotify track matched “${query}”.`)

	const playResponse = await fetch(`${SPOTIFY_PLAYER_URL}/play`, {
		method: 'PUT',
		headers: {
			authorization: `Bearer ${accessToken}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({ uris: [track.uri] }),
	})
	if (!playResponse.ok) {
		throw new Error(await spotifyAgentErrorMessage(playResponse))
	}

	return {
		artists: track.artists,
		played: true,
		title: track.title,
	}
}

async function getSpotifyConnection(request: Request, env: Env) {
	const configured = Boolean(getSpotifyConfiguration(env))
	const authentication = await requireSession(request, env)
	if (authentication.response) return { response: authentication.response } as const
	if (!configured) return { accessToken: null, configured } as const

	const auth = createAuth(request, env)
	const accounts = await auth.api.listUserAccounts({ headers: request.headers })
	if (!accounts.some(({ providerId }) => providerId === 'spotify')) {
		return { accessToken: null, configured } as const
	}

	try {
		const token = await auth.api.getAccessToken({
			body: { providerId: 'spotify' },
			headers: request.headers,
		})
		return { accessToken: token.accessToken, configured } as const
	} catch {
		return {
			response: Response.json(
				{ error: 'Spotify authorization has expired. Reconnect it in Settings.' },
				{ status: 409 }
			),
		} as const
	}
}

async function getSpotifyAccessTokenForAgent(request: Request, env: Env) {
	if (!getSpotifyConfiguration(env)) return null

	try {
		const token = await createAuth(request, env).api.getAccessToken({
			body: { providerId: 'spotify' },
			headers: request.headers,
		})
		return token.accessToken
	} catch {
		return null
	}
}

function spotifyPlayerResponse(
	configured: boolean,
	connected: boolean,
	playback: SpotifyPlayback | null
) {
	return Response.json({
		configured,
		connected,
		playback,
	} satisfies SpotifyPlayerResponse)
}

function getSpotifyActionRequest(action: 'next' | 'pause' | 'play' | 'previous') {
	switch (action) {
		case 'play':
			return { method: 'PUT', path: '/play' } as const
		case 'pause':
			return { method: 'PUT', path: '/pause' } as const
		case 'next':
			return { method: 'POST', path: '/next' } as const
		case 'previous':
			return { method: 'POST', path: '/previous' } as const
	}
}

async function spotifyAPIErrorResponse(response: Response) {
	const data: unknown = await response.json().catch(() => null)
	const providerMessage = readString(readRecord(readRecord(data)?.error), 'message')

	if (response.status === 401) {
		return Response.json(
			{ error: 'Spotify authorization has expired. Reconnect it in Settings.' },
			{ status: 409 }
		)
	}
	if (response.status === 403) {
		return Response.json(
			{ error: providerMessage ?? 'Spotify cannot control this account or device.' },
			{ status: 403 }
		)
	}
	if (response.status === 404) {
		return Response.json(
			{ error: providerMessage ?? 'Open Spotify on a device, then try again.' },
			{ status: 409 }
		)
	}

	return Response.json(
		{ error: providerMessage ?? 'Spotify is unavailable right now.' },
		{ status: response.status === 429 ? 429 : 502 }
	)
}

async function spotifyAgentErrorMessage(response: Response) {
	const data: unknown = await response.json().catch(() => null)
	const providerMessage = readString(readRecord(readRecord(data)?.error), 'message')

	if (response.status === 401) {
		return 'Spotify authorization has expired. Reconnect it in Settings.'
	}
	if (response.status === 403) {
		return providerMessage ?? 'Spotify cannot control this account or device.'
	}
	if (response.status === 404) {
		return providerMessage ?? 'Open Spotify on a device, then ask me again.'
	}
	if (response.status === 429) {
		return 'Spotify is receiving too many requests. Try again shortly.'
	}
	return providerMessage ?? 'Spotify is unavailable right now.'
}

export function parseSpotifyPlayback(data: unknown): SpotifyPlayback | null {
	const playback = readRecord(data)
	if (!playback) return null

	const device = readRecord(playback.device)
	return {
		device: {
			isRestricted: readBoolean(device, 'is_restricted') ?? false,
			name: readString(device, 'name') ?? 'Spotify',
			type: readString(device, 'type') ?? 'device',
		},
		isPlaying: readBoolean(playback, 'is_playing') ?? false,
		item: parseSpotifyItem(playback.item),
		progressMS: Math.max(0, readNumber(playback, 'progress_ms') ?? 0),
	}
}

export function parseSpotifySearchTrack(data: unknown) {
	const tracks = readRecord(readRecord(data)?.tracks)
	const items = tracks?.items
	if (!Array.isArray(items)) return null

	const track = readRecord(items[0])
	const uri = readString(track, 'uri')
	const title = readString(track, 'name')
	if (!uri || !title) return null

	return {
		artists: readArtistNames(track?.artists),
		title,
		uri,
	}
}

function parseSpotifyItem(value: unknown): SpotifyPlaybackItem | null {
	const item = readRecord(value)
	if (!item) return null

	const typeValue = readString(item, 'type')
	const type = typeValue === 'track' || typeValue === 'episode' ? typeValue : 'unknown'
	const album = readRecord(item.album)
	const show = readRecord(item.show)
	const subtitle = type === 'track'
		? readArtistNames(item.artists)
		: readString(show, 'name') ?? ''

	return {
		albumImageURL: readFirstImageURL(type === 'track' ? album?.images : item.images),
		durationMS: Math.max(0, readNumber(item, 'duration_ms') ?? 0),
		externalURL: readString(readRecord(item.external_urls), 'spotify'),
		subtitle,
		title: readString(item, 'name') ?? 'Unknown title',
		type,
	}
}

function readArtistNames(value: unknown) {
	if (!Array.isArray(value)) return ''
	return value
		.map((artist) => readString(readRecord(artist), 'name'))
		.filter((name): name is string => Boolean(name))
		.join(', ')
}

function readFirstImageURL(value: unknown) {
	if (!Array.isArray(value)) return null
	for (const image of value) {
		const url = readString(readRecord(image), 'url')
		if (url) return url
	}
	return null
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && hasObjectType(value)
		? value as Record<string, unknown>
		: null
}

function readString(record: Record<string, unknown> | null | undefined, key: string) {
	const value = record?.[key]
	return isString(value) ? value : null
}

function readNumber(record: Record<string, unknown> | null | undefined, key: string) {
	const value = record?.[key]
	return isNumber(value) && Number.isFinite(value) ? value : null
}

function readBoolean(record: Record<string, unknown> | null | undefined, key: string) {
	const value = record?.[key]
	return isBoolean(value) ? value : null
}
