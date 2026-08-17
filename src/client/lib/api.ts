export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const headers = new Headers(init?.headers)
	if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
	const response = await fetch(input, {
		...init,
		headers,
	})

	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null)
		const message =
			body && typeof body === 'object' && typeof Reflect.get(body, 'error') === 'string'
				? String(Reflect.get(body, 'error'))
				: `Request failed with status ${response.status}`
		throw new Error(message)
	}

	return response.json() as Promise<T>
}
