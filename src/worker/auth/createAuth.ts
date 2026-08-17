import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { SPOTIFY_SCOPES } from '@agentboard/shared'
import { betterAuth } from 'better-auth'
import { genericOAuth } from 'better-auth/plugins'
import { createDatabase } from '../db/client'
import * as schema from '../db/schema'

const LOCAL_DEVELOPMENT_SECRET = 'agentboard-local-development-secret-change-me'

export interface OAuthConfiguration {
	clientID: string
	clientSecret: string
	discoveryURL: string
	providerID: string
	providerName: string
	scopes: string[]
}

export interface SpotifyConfiguration {
	clientID: string
	clientSecret: string
}

export type AuthConfigurationEnvironment = Partial<Record<
	| 'OAUTH_CLIENT_ID' | 'OAUTH_CLIENT_SECRET' | 'OAUTH_DISCOVERY_URL'
	| 'OAUTH_PROVIDER_ID' | 'OAUTH_PROVIDER_NAME' | 'OAUTH_SCOPES'
	| 'SPOTIFY_CLIENT_ID' | 'SPOTIFY_CLIENT_SECRET', string
>>

export function getOAuthConfiguration(env: AuthConfigurationEnvironment): OAuthConfiguration | null {
	if (!env.OAUTH_CLIENT_ID || !env.OAUTH_CLIENT_SECRET || !env.OAUTH_DISCOVERY_URL) return null

	return {
		clientID: env.OAUTH_CLIENT_ID,
		clientSecret: env.OAUTH_CLIENT_SECRET,
		discoveryURL: env.OAUTH_DISCOVERY_URL,
		providerID: env.OAUTH_PROVIDER_ID ?? 'campus-sso',
		providerName: env.OAUTH_PROVIDER_NAME ?? 'Passport',
		scopes: env.OAUTH_SCOPES?.split(',').map((scope) => scope.trim()).filter(Boolean) ?? [
			'openid',
			'email',
			'profile',
		],
	}
}

export function getSpotifyConfiguration(env: AuthConfigurationEnvironment): SpotifyConfiguration | null {
	if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null

	return {
		clientID: env.SPOTIFY_CLIENT_ID,
		clientSecret: env.SPOTIFY_CLIENT_SECRET,
	}
}

export function createAuth(request: Request, env: Env) {
	const requestURL = new URL(request.url)
	const baseURL = env.BETTER_AUTH_URL ?? requestURL.origin
	const oAuth = getOAuthConfiguration(env)
	const spotify = getSpotifyConfiguration(env)
	const secret = getAuthSecret(env, requestURL)
	const plugins = oAuth
		? [
				genericOAuth({
					config: [
						{
							providerId: oAuth.providerID,
							clientId: oAuth.clientID,
							clientSecret: oAuth.clientSecret,
							discoveryUrl: oAuth.discoveryURL,
							requireIssuerValidation: true,
							pkce: true,
							scopes: oAuth.scopes,
						},
					],
				}),
			]
		: []

	return betterAuth({
		appName: 'Thinkspace',
		basePath: '/api/auth',
		baseURL,
		secret,
		trustedOrigins: [new URL(baseURL).origin],
		database: drizzleAdapter(createDatabase(env), {
			provider: 'sqlite',
			schema,
		}),
		advanced: {
			useSecureCookies: new URL(baseURL).protocol === 'https:',
		},
		account: {
			accountLinking: {
				allowDifferentEmails: true,
				enabled: true,
				trustedProviders: spotify ? ['spotify'] : [],
			},
		},
		plugins,
		socialProviders: spotify
			? {
					spotify: {
						clientId: spotify.clientID,
						clientSecret: spotify.clientSecret,
						disableSignUp: true,
						scope: [...SPOTIFY_SCOPES],
					},
				}
			: {},
	})
}

function getAuthSecret(env: Env, requestURL: URL) {
	if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET
	if (requestURL.hostname === 'localhost' || requestURL.hostname === '127.0.0.1') {
		return LOCAL_DEVELOPMENT_SECRET
	}

	throw new Error('BETTER_AUTH_SECRET must be configured in non-local environments')
}
