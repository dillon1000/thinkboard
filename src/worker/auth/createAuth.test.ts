import { describe, expect, it } from 'vitest'
import { getOAuthConfiguration } from './createAuth'

describe('generic OAuth configuration', () => {
	it('stays disabled until all required provider values are present', () => {
		const env = { OAUTH_CLIENT_ID: 'client-only' } as unknown as Env
		expect(getOAuthConfiguration(env)).toBeNull()
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
