import { describe, expect, it } from 'vitest'
import { getOAuthConfiguration, getSpotifyConfiguration } from './createAuth'

describe('generic OAuth configuration', () => {
	it('stays disabled until all required provider values are present', () => {
		const env = { OAUTH_CLIENT_ID: 'client-only' } as unknown as Env
		expect(getOAuthConfiguration(env)).toBeNull()
	})

	it('uses Passport when no provider label override is configured', () => {
		const env = {
			OAUTH_CLIENT_ID: 'client-id',
			OAUTH_CLIENT_SECRET: 'client-secret',
			OAUTH_DISCOVERY_URL: 'https://login.example.edu/.well-known/openid-configuration',
		} as unknown as Env

		expect(getOAuthConfiguration(env)?.providerName).toBe('Passport')
	})

	it('normalizes scopes and provider labels from the environment', () => {
		const env = {
			OAUTH_CLIENT_ID: 'client-id',
			OAUTH_CLIENT_SECRET: 'client-secret',
			OAUTH_DISCOVERY_URL: 'https://login.example.edu/.well-known/openid-configuration',
			OAUTH_PROVIDER_ID: 'university',
			OAUTH_PROVIDER_NAME: 'University login',
			OAUTH_SCOPES: 'openid, email, profile',
		} as unknown as Env

		expect(getOAuthConfiguration(env)).toEqual({
			clientID: 'client-id',
			clientSecret: 'client-secret',
			discoveryURL: 'https://login.example.edu/.well-known/openid-configuration',
			providerID: 'university',
			providerName: 'University login',
			scopes: ['openid', 'email', 'profile'],
		})
	})
})

describe('Spotify configuration', () => {
	it('stays disabled until both credentials are present', () => {
		const env = { SPOTIFY_CLIENT_ID: 'client-only' } as unknown as Env
		expect(getSpotifyConfiguration(env)).toBeNull()
	})

	it('returns the configured client credentials', () => {
		const env = {
			SPOTIFY_CLIENT_ID: 'spotify-client-id',
			SPOTIFY_CLIENT_SECRET: 'spotify-client-secret',
		} as unknown as Env

		expect(getSpotifyConfiguration(env)).toEqual({
			clientID: 'spotify-client-id',
			clientSecret: 'spotify-client-secret',
		})
	})
})
