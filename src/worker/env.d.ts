interface Env {
	BETTER_AUTH_SECRET?: string
	BETTER_AUTH_URL?: string
	OAUTH_CLIENT_ID?: string
	OAUTH_CLIENT_SECRET?: string
	OAUTH_DISCOVERY_URL?: string
	OAUTH_SCOPES?: string
	SPOTIFY_CLIENT_ID?: string
	SPOTIFY_CLIENT_SECRET?: string
	EXA_API_KEY?: string
	OPENROUTER_API_KEY?: string
	POSTHOG_PROJECT_TOKEN?: string
	POSTHOG_HOST?: string
	POSTHOG_AI_PRIVACY_MODE?: string
	TLDRAW_LICENSE_KEY?: string
	AI_GATEWAY_ID?: string
	LOCK_IN_MODEL?: string
	FLASHCARD_GRADING_MODEL?: string
	CONVERSATION_TITLE_MODEL?: string
	EMBEDDING_MODEL?: string
	OCR_MODEL?: string
	PDF_DAILY_PAGE_QUOTA?: string
	PDF_STORED_BYTES_QUOTA?: string
}

declare module '*.sql' {
	const content: string
	export default content
}
