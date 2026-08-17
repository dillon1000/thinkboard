import { z } from 'zod'

export const SPOTIFY_SCOPES = [
	'user-read-playback-state',
	'user-read-currently-playing',
	'user-modify-playback-state',
	'user-read-private',
] as const

export const spotifyPlaybackActionSchema = z.object({
	action: z.enum(['play', 'pause', 'next', 'previous']),
})

export type SpotifyPlaybackAction = z.infer<typeof spotifyPlaybackActionSchema>['action']

export const spotifyAgentPlayInputSchema = z.object({
	query: z.string().trim().min(1).max(200),
})

export const spotifyAgentPlayOutputSchema = z.object({
	artists: z.string(),
	played: z.literal(true),
	title: z.string(),
})

export type SpotifyAgentPlayInput = z.infer<typeof spotifyAgentPlayInputSchema>
export type SpotifyAgentPlayOutput = z.infer<typeof spotifyAgentPlayOutputSchema>

export const spotifyPlaybackItemSchema = z.object({
	albumImageURL: z.string().nullable(),
	durationMS: z.number(),
	externalURL: z.string().nullable(),
	subtitle: z.string(),
	title: z.string(),
	type: z.enum(['episode', 'track', 'unknown']),
})

export const spotifyPlaybackSchema = z.object({
	device: z.object({
		isRestricted: z.boolean(),
		name: z.string(),
		type: z.string(),
	}),
	isPlaying: z.boolean(),
	item: spotifyPlaybackItemSchema.nullable(),
	progressMS: z.number(),
})

export const spotifyPlayerResponseSchema = z.object({
	configured: z.boolean(),
	connected: z.boolean(),
	playback: spotifyPlaybackSchema.nullable(),
})

export type SpotifyPlaybackItem = z.infer<typeof spotifyPlaybackItemSchema>
export type SpotifyPlayback = z.infer<typeof spotifyPlaybackSchema>
export type SpotifyPlayerResponse = z.infer<typeof spotifyPlayerResponseSchema>
