interface MessagePart {
	text?: string
	type: string
}

/** Returns the visible text from a chat message without reasoning or tool payloads. */
export function getMessageCopyText(parts: readonly MessagePart[]): string {
	return parts
		.flatMap((part) => part.type === 'text' && part.text?.trim() ? [part.text.trim()] : [])
		.join('\n\n')
}
