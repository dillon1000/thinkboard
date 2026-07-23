import { createAuth } from './createAuth'

export async function getSession(request: Request, env: Env) {
	return createAuth(request, env).api.getSession({ headers: request.headers })
}

export async function requireSession(request: Request, env: Env) {
	const session = await getSession(request, env)
	if (!session) {
		return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) } as const
	}

	return { session } as const
}
