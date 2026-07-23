interface ChatMessageLike {
	role: string
}

interface ResolveCanvasContextOptions<TContext> {
	capture: () => Promise<TContext>
	messages: readonly ChatMessageLike[]
	previous: TContext | null
}

export async function resolveCanvasContextForRequest<TContext>({
	capture,
	messages,
	previous,
}: ResolveCanvasContextOptions<TContext>): Promise<TContext> {
	const latestMessage = messages.at(-1)
	if (latestMessage?.role === 'assistant' && previous) return previous
	return capture()
}
