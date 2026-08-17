import { z } from 'zod'

const apiErrorSchema = z.object({ error: z.string() })

export async function apiRequest<Schema extends z.ZodType>(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	schema: Schema
): Promise<z.output<Schema>>
export async function apiRequest(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<z.infer<ReturnType<typeof z.json>>>
export async function apiRequest(
	input: RequestInfo | URL,
	init?: RequestInit,
	schema: z.ZodType = z.json()
) {
	const headers = new Headers(init?.headers)
	if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
	const response = await fetch(input, {
		...init,
		headers,
	})

	if (!response.ok) {
		const body = apiErrorSchema.safeParse(await response.json().catch(() => null))
		const message = body.success
			? body.data.error
			: `Request failed with status ${response.status}`
		throw new Error(message)
	}

	return schema.parse(await response.json())
}
