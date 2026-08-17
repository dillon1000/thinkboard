const ZEN_CHAT_PROMPT_EVENT = 'agentboard:zen-chat-prompt'
let pendingPrompt: string | null = null

/** Queues a prompt before the chat pane mounts, then also informs an already-open composer. */
export function requestZenChatPrompt(prompt: string) {
	pendingPrompt = prompt
	window.dispatchEvent(new CustomEvent<string>(ZEN_CHAT_PROMPT_EVENT, { detail: prompt }))
}

/** Delivers the queued Zen prompt once and keeps the mounted composer in sync with later requests. */
export function subscribeToZenChatPrompt(onPrompt: (prompt: string) => void) {
	if (pendingPrompt) {
		onPrompt(pendingPrompt)
		pendingPrompt = null
	}
	const handlePrompt = (event: Event) => {
		if (!(event instanceof CustomEvent)) return
		const prompt = z.string().min(1).safeParse(event.detail)
		if (!prompt.success) return
		pendingPrompt = null
		onPrompt(prompt.data)
	}
	window.addEventListener(ZEN_CHAT_PROMPT_EVENT, handlePrompt)
	return () => window.removeEventListener(ZEN_CHAT_PROMPT_EVENT, handlePrompt)
}
import { z } from 'zod'
