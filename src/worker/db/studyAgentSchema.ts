import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const studyAgentMessage = sqliteTable('cf_ai_chat_agent_messages', {
	id: text('id').primaryKey(),
	message: text('message', { mode: 'json' }).$type<unknown>().notNull(),
	createdAt: text('created_at'),
})
