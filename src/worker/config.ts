import type { PublicConfig } from '@agentboard/shared'
import { getOAuthConfiguration } from './auth/createAuth'

export function getPublicConfig(env: Env): PublicConfig {
	const oAuth = getOAuthConfiguration(env)

	return {
		oAuth: {
			enabled: Boolean(oAuth),
			providerID: oAuth?.providerID ?? env.OAUTH_PROVIDER_ID ?? 'campus-sso',
			providerName: oAuth?.providerName ?? env.OAUTH_PROVIDER_NAME ?? 'Campus SSO',
		},
		tldrawLicenseKey: env.TLDRAW_LICENSE_KEY?.trim() || null,
	}
}

export function getDocumentAIConfig(env: Env) {
	return {
		embeddingModel: env.EMBEDDING_MODEL?.trim() || '@cf/baai/bge-base-en-v1.5',
		gatewayID: env.AI_GATEWAY_ID?.trim() || 'default',
		ocrModel: env.OCR_MODEL?.trim() || '@cf/meta/llama-4-scout-17b-16e-instruct',
	}
}
