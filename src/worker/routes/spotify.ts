import {
	spotifyPlaybackActionSchema,
	type SpotifyAgentPlayOutput,
	type SpotifyPlayback,
	type SpotifyPlaybackItem,
	type SpotifyPlayerResponse,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { z } from 'zod'
import { createAuth, getSpotifyConfiguration } from '../auth/createAuth'
import { requireSession } from '../auth/session'

const SPOTIFY_PLAYER_URL = 'https://api.spotify.com/v1/me/player'
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search'
const spotifyArtistSchema = z.object({ name: z.string() })
const spotifyImageSchema = z.object({ url: z.string() })
const spotifyItemSchema = z.object({
	album: z.object({ images: z.array(spotifyImageSchema).optional() }).optional(),
	artists: z.array(spotifyArtistSchema).optional(),
	duration_ms: z.number().finite().optional(),
	external_urls: z.object({ spotify: z.string().optional() }).optional(),
	images: z.array(spotifyImageSchema).optional(),
	name: z.string().optional(),
	show: z.object({ name: z.string().optional() }).optional(),
	type: z.enum(['track', 'episode']).optional(),
})
const spotifySearchTrackSchema = spotifyItemSchema.extend({
	name: z.string(),
	uri: z.string(),
})
const spotifyPlaybackSchema = z.object({
	device: z.object({
		is_restricted: z.boolean().nullish(),
		name: z.string().nullish(),
		type: z.string().nullish(),
	}).nullish(),
	is_playing: z.boolean().nullish(),
	item: spotifyItemSchema.nullish(),
	progress_ms: z.number().finite().nullish(),
})
const spotifySearchSchema = z.object({
	tracks: z.object({ items: z.array(spotifySearchTrackSchema) }),
})
const spotifyErrorSchema = z.object({
	error: z.object({ message: z.string().optional() }),
})

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
	const data = spotifyErrorSchema.safeParse(await response.json().catch(() => null))
	const providerMessage = data.success ? data.data.error.message : undefined

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
	const data = spotifyErrorSchema.safeParse(await response.json().catch(() => null))
	const providerMessage = data.success ? data.data.error.message : undefined

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

export function parseSpotifyPlayback<Value>(data: Value): SpotifyPlayback | null {
	const playback = spotifyPlaybackSchema.safeParse(data)
	if (!playback.success) return null
	const { device, item, progress_ms: progressMS, is_playing: isPlaying } = playback.data
	return {
		device: {
			isRestricted: device?.is_restricted ?? false,
			name: device?.name ?? 'Spotify',
			type: device?.type ?? 'device',
		},
		isPlaying: isPlaying ?? false,
		item: parseSpotifyItem(item),
		progressMS: Math.max(0, progressMS ?? 0),
	}
}

export function parseSpotifySearchTrack<Value>(data: Value) {
	const parsed = spotifySearchSchema.safeParse(data)
	if (!parsed.success) return null
	const track = parsed.data.tracks.items[0]
	if (!track) return null
	const { name: title, uri } = track
	if (!uri || !title) return null

	return {
		artists: readArtistNames(track.artists),
		title,
		uri,
	}
}

function parseSpotifyItem<Value>(value: Value): SpotifyPlaybackItem | null {
	const parsed = spotifyItemSchema.safeParse(value)
	if (!parsed.success) return null
	const item = parsed.data
	const type = item.type ?? 'unknown'
	const subtitle = type === 'track'
		? readArtistNames(item.artists)
		: item.show?.name ?? ''

	return {
		albumImageURL: readFirstImageURL(type === 'track' ? item.album?.images : item.images),
		durationMS: Math.max(0, item.duration_ms ?? 0),
		externalURL: item.external_urls?.spotify ?? null,
		subtitle,
		title: item.name ?? 'Unknown title',
		type,
	}
}

function readArtistNames<Value>(value: Value) {
	const artists = z.array(spotifyArtistSchema).safeParse(value)
	if (!artists.success) return ''
	return artists.data
		.map(({ name }) => name)
		.join(', ')
}

function readFirstImageURL<Value>(value: Value) {
	const images = z.array(spotifyImageSchema).safeParse(value)
	return images.success ? images.data[0]?.url ?? null : null
}
