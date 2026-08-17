import { hasObjectType, isString } from '@agentboard/shared'
export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const response = await fetch(input, {
		...init,
		headers: {
			...(init?.body ? { 'content-type': 'application/json' } : {}),
			...init?.headers,
		},
	})

	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null)
		const message =
			body && hasObjectType(body) && isString(Reflect.get(body, 'error'))
				? String(Reflect.get(body, 'error'))
				: `Request failed with status ${response.status}`
		throw new Error(message)
	}

	return response.json() as Promise<T>
}
