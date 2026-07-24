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

export interface SpotifyPlaybackItem {
	albumImageURL: string | null
	durationMS: number
	externalURL: string | null
	subtitle: string
	title: string
	type: 'episode' | 'track' | 'unknown'
}

export interface SpotifyPlayback {
	device: {
		isRestricted: boolean
		name: string
		type: string
	}
	isPlaying: boolean
	item: SpotifyPlaybackItem | null
	progressMS: number
}

export interface SpotifyPlayerResponse {
	configured: boolean
	connected: boolean
	playback: SpotifyPlayback | null
}
