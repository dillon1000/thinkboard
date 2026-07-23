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
})
