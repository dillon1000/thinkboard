import migration0000 from '../../../infra/cloudflare/durable-object-migrations/0000_study_messages.sql'
import { asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import { studyAgentMessage } from './studyAgentSchema'
import * as schema from './studyAgentSchema'

const migrations = {
	journal: {
		entries: [
			{
				idx: 0,
				when: 1_721_350_400_000,
				tag: '0000_study_messages',
				breakpoints: true,
			},
		],
	},
	migrations: { m0000: migration0000 },
}

export function createStudyAgentDatabase(storage: DurableObjectStorage) {
	return drizzle(storage, { schema })
}

export type StudyAgentDatabase = ReturnType<typeof createStudyAgentDatabase>

export function migrateStudyAgentDatabase(database: StudyAgentDatabase) {
	return migrate(database, migrations)
}

export function loadStudyMessages(database: StudyAgentDatabase): unknown[] {
	return database
		.select({ message: studyAgentMessage.message })
		.from(studyAgentMessage)
		.orderBy(asc(studyAgentMessage.createdAt), asc(studyAgentMessage.id))
		.all()
		.map(({ message }) => message)
}

export function replaceStudyMessages<TMessage extends { id: string }>(
	database: StudyAgentDatabase,
	messages: ReadonlyArray<TMessage>
) {
	const timestamp = Date.now()
	database.transaction((transaction) => {
		transaction.delete(studyAgentMessage).run()
		if (messages.length === 0) return
		transaction
			.insert(studyAgentMessage)
			.values(messages.map((message, index) => ({
				id: message.id,
				message,
				createdAt: new Date(timestamp + index).toISOString(),
			})))
			.run()
	})
}
