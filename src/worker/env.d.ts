interface Env {
	BETTER_AUTH_SECRET?: string
	BETTER_AUTH_URL?: string
	OAUTH_CLIENT_ID?: string
	OAUTH_CLIENT_SECRET?: string
	OAUTH_DISCOVERY_URL?: string
	OAUTH_SCOPES?: string
	TLDRAW_LICENSE_KEY?: string
	AI_GATEWAY_ID?: string
	EMBEDDING_MODEL?: string
	OCR_MODEL?: string
	PDF_DAILY_PAGE_QUOTA?: string
	PDF_STORED_BYTES_QUOTA?: string
}

declare module '*.sql' {
	const content: string
	export default content
}
