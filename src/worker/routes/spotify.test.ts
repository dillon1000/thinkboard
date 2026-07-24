import { describe, expect, it } from 'vitest'
import { parseSpotifyPlayback, parseSpotifySearchTrack } from './spotify'

describe('parseSpotifyPlayback', () => {
	it('normalizes a Spotify track response for the client', () => {
		expect(parseSpotifyPlayback({
			device: {
				is_restricted: false,
				name: 'Desk speaker',
				type: 'Speaker',
			},
			is_playing: true,
			progress_ms: 42_000,
			item: {
				album: {
					images: [{ url: 'https://i.scdn.co/cover.jpg' }],
				},
				artists: [{ name: 'Nils Frahm' }, { name: 'Ólafur Arnalds' }],
				duration_ms: 215_000,
				external_urls: { spotify: 'https://open.spotify.com/track/abc' },
				name: 'Because This Must Be',
				type: 'track',
			},
		})).toEqual({
			device: {
				isRestricted: false,
				name: 'Desk speaker',
				type: 'Speaker',
			},
			isPlaying: true,
			progressMS: 42_000,
			item: {
				albumImageURL: 'https://i.scdn.co/cover.jpg',
				durationMS: 215_000,
				externalURL: 'https://open.spotify.com/track/abc',
				subtitle: 'Nils Frahm, Ólafur Arnalds',
				title: 'Because This Must Be',
				type: 'track',
			},
		})
	})

	it('handles an inactive or malformed playback response safely', () => {
		expect(parseSpotifyPlayback(null)).toBeNull()
		expect(parseSpotifyPlayback({
			device: null,
			is_playing: false,
			item: null,
			progress_ms: null,
		})).toEqual({
			device: {
				isRestricted: false,
				name: 'Spotify',
				type: 'device',
			},
			isPlaying: false,
			item: null,
			progressMS: 0,
		})
	})
})

describe('parseSpotifySearchTrack', () => {
	it('returns the first playable track', () => {
		expect(parseSpotifySearchTrack({
			tracks: {
				items: [{
					artists: [{ name: 'Khruangbin' }],
					name: 'Friday Morning',
					uri: 'spotify:track:abc',
				}],
			},
		})).toEqual({
			artists: 'Khruangbin',
			title: 'Friday Morning',
			uri: 'spotify:track:abc',
		})
	})

	it('rejects malformed or empty search results', () => {
		expect(parseSpotifySearchTrack({ tracks: { items: [] } })).toBeNull()
		expect(parseSpotifySearchTrack({ tracks: { items: [{ name: 'No URI' }] } })).toBeNull()
	})
})
