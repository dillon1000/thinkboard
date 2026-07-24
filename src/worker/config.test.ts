import { describe, expect, it } from 'vitest'
import { getPublicConfig } from './config'

describe('getPublicConfig', () => {
	it('exposes a configured tldraw license key to the canvas client', () => {
		const config = getPublicConfig({
			OAUTH_CLIENT_ID: 'client-id',
			OAUTH_CLIENT_SECRET: 'client-secret',
			OAUTH_DISCOVERY_URL: 'https://identity.example.com/.well-known/openid-configuration',
			TLDRAW_LICENSE_KEY: '  test-license-key  ',
		} as unknown as Env)

		expect(config.tldrawLicenseKey).toBe('test-license-key')
		expect(config.oAuth.enabled).toBe(true)
	})

	it('uses null when no tldraw license key is configured', () => {
		const config = getPublicConfig({} as Env)

		expect(config.tldrawLicenseKey).toBeNull()
	})

	it('uses Passport as the app-wide OAuth label', () => {
		const config = getPublicConfig({} as Env)

		expect(config.oAuth.providerName).toBe('Passport')
	})

	it('exposes Spotify availability without exposing its credentials', () => {
		const config = getPublicConfig({
			SPOTIFY_CLIENT_ID: 'spotify-client-id',
			SPOTIFY_CLIENT_SECRET: 'spotify-client-secret',
		} as Env)

		expect(config.spotify.enabled).toBe(true)
		expect(JSON.stringify(config)).not.toContain('spotify-client-id')
		expect(JSON.stringify(config)).not.toContain('spotify-client-secret')
	})
})
