import { drizzleAdapter } from '@better-auth/drizzle-adapter'
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

export function getOAuthConfiguration(env: Env): OAuthConfiguration | null {
	if (!env.OAUTH_CLIENT_ID || !env.OAUTH_CLIENT_SECRET || !env.OAUTH_DISCOVERY_URL) return null

	return {
		clientID: env.OAUTH_CLIENT_ID,
		clientSecret: env.OAUTH_CLIENT_SECRET,
		discoveryURL: env.OAUTH_DISCOVERY_URL,
		providerID: env.OAUTH_PROVIDER_ID ?? 'campus-sso',
		providerName: env.OAUTH_PROVIDER_NAME ?? 'Campus SSO',
		scopes: env.OAUTH_SCOPES?.split(',').map((scope) => scope.trim()).filter(Boolean) ?? [
			'openid',
			'email',
			'profile',
		],
	}
}

export function createAuth(request: Request, env: Env) {
	const requestURL = new URL(request.url)
	const baseURL = env.BETTER_AUTH_URL ?? requestURL.origin
	const oAuth = getOAuthConfiguration(env)
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
		appName: 'Agentboard',
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
		plugins,
	})
}

function getAuthSecret(env: Env, requestURL: URL) {
	if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET
	if (requestURL.hostname === 'localhost' || requestURL.hostname === '127.0.0.1') {
		return LOCAL_DEVELOPMENT_SECRET
	}

	throw new Error('BETTER_AUTH_SECRET must be configured in non-local environments')
}
