import type { IRequest } from 'itty-router'

const INGEST_PREFIX = '/ingest'
const API_HOST = 'us.i.posthog.com'
const ASSET_HOST = 'us-assets.i.posthog.com'

// Forwards browser PostHog traffic through the app's own domain. Ad blockers drop requests to the
// PostHog ingestion host by name, so the client sends capture to `/ingest/*` and the Worker relays
// it. Static SDK assets live on a separate host, so `/ingest/static/*` targets the asset host.
export async function handlePostHogProxy(request: IRequest): Promise<Response> {
	const target = new URL(request.url)
	const forwardPath = target.pathname.slice(INGEST_PREFIX.length) || '/'

	target.protocol = 'https:'
	target.host = forwardPath.startsWith('/static/') ? ASSET_HOST : API_HOST
	target.port = ''
	target.pathname = forwardPath

	const proxyRequest = new Request(target, request)
	proxyRequest.headers.set('host', target.host)

	return fetch(proxyRequest)
}
