import type { PublicConfig } from '@agentboard/shared'
import {
	getOAuthConfiguration,
	getSpotifyConfiguration,
	type AuthConfigurationEnvironment,
} from './auth/createAuth'

export function getPublicConfig(
	env: AuthConfigurationEnvironment & Partial<Pick<Env, 'TLDRAW_LICENSE_KEY'>>
): PublicConfig {
	const oAuth = getOAuthConfiguration(env)
	const spotify = getSpotifyConfiguration(env)

	return {
		oAuth: {
			enabled: Boolean(oAuth),
			providerID: oAuth?.providerID ?? env.OAUTH_PROVIDER_ID ?? 'campus-sso',
			providerName: oAuth?.providerName ?? env.OAUTH_PROVIDER_NAME ?? 'Passport',
		},
		spotify: {
			enabled: Boolean(spotify),
		},
		tldrawLicenseKey: env.TLDRAW_LICENSE_KEY?.trim() || null,
	}
}

export function getDocumentAIConfig(env: Env) {
	return {
		embeddingModel: env.EMBEDDING_MODEL?.trim() || '@cf/baai/bge-large-en-v1.5',
		gatewayID: env.AI_GATEWAY_ID?.trim() || 'default',
		ocrModel: env.OCR_MODEL?.trim() || '@cf/meta/llama-4-scout-17b-16e-instruct',
	}
}
