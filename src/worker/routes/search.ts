import { globalSearchQuerySchema } from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { requireSession } from '../auth/session'
import { createDatabase } from '../db/client'
import { searchWorkspace } from '../search/globalSearch'

export async function handleGlobalSearch(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const parsed = globalSearchQuerySchema.safeParse(new URL(request.url).searchParams.get('q'))
	if (!parsed.success) return Response.json({ results: [] })
	try {
		const results = await searchWorkspace(
			createDatabase(env),
			env,
			authentication.session.user.id,
			parsed.data
		)
		return Response.json({ results })
	} catch (error) {
		console.error(JSON.stringify({
			error: error instanceof Error ? error.message : 'Unknown search error',
			pipeline: 'workspace-search',
		}))
		return Response.json({ error: 'Search is temporarily unavailable' }, { status: 502 })
	}
}
