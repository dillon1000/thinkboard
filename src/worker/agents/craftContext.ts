import { getCraftDocumentCitationHref } from '@agentboard/shared'
import type { ModelMessage, UserModelMessage } from 'ai'
import { listCraftDocumentLinkRows } from '../db/craft'
import type { Database } from '../db/client'
import {
	retrieveLinkedCraftDocuments,
	type CraftDocumentContext,
} from '../integrations/craft'

export async function retrieveBoardCraftContext(
	env: Env,
	database: Database,
	boardID: string,
	query: string
) {
	if (!query.trim()) return []
	const links = await listCraftDocumentLinkRows(database, boardID)
	if (!links.length) return []
	return retrieveLinkedCraftDocuments(env, links, query)
}

export function attachCraftDocumentContext(
	messages: ModelMessage[],
	results: readonly CraftDocumentContext[]
) {
	if (!results.length) return messages
	const userMessageIndex = messages.findLastIndex(({ role }) => role === 'user')
	if (userMessageIndex < 0) return messages
	const userMessage = messages[userMessageIndex] as UserModelMessage
	const content = typeof userMessage.content === 'string'
		? [{ type: 'text' as const, text: userMessage.content }]
		: userMessage.content
	const sources = results.map((result, index) => [
		`Source ${index + 1}: [${result.title}](${getCraftDocumentCitationHref(result.linkID)})`,
		`Linked document ID for appendCraftDocument: ${result.linkID}`,
		result.markdown,
	].join('\n')).join('\n\n')
	const nextMessages = [...messages]
	nextMessages[userMessageIndex] = {
		...userMessage,
		content: [...content, {
			type: 'text' as const,
			text: `Live Craft documents linked to this board:\n<craft-document-context>\n${sources}\n</craft-document-context>`,
		}],
	}
	return nextMessages
}
