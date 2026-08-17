import type { StudyConversation } from '@agentboard/shared'
import { and, desc, eq } from 'drizzle-orm'
import type { Database } from './client'
import { studyConversation } from './schema'

const DEFAULT_CONVERSATION_TITLE = 'New conversation'

export async function listStudyConversations(
	database: Database,
	boardID: string,
	userID: string
): Promise<StudyConversation[]> {
	let rows = await selectConversations(database, boardID, userID)
	if (rows.length > 0) return rows.map(toStudyConversation)

	const now = new Date()
	await database
		.insert(studyConversation)
		.values({
			id: crypto.randomUUID(),
			agentName: `${userID}.${boardID}`,
			boardID,
			userID,
			title: DEFAULT_CONVERSATION_TITLE,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({ target: studyConversation.agentName })

	rows = await selectConversations(database, boardID, userID)
	return rows.map(toStudyConversation)
}

export async function createStudyConversation(
	database: Database,
	boardID: string,
	userID: string
): Promise<StudyConversation> {
	const id = crypto.randomUUID()
	const now = new Date()
	const value = {
		id,
		agentName: `${userID}.${boardID}.${id}`,
		boardID,
		userID,
		title: DEFAULT_CONVERSATION_TITLE,
		createdAt: now,
		updatedAt: now,
	}
	await database.insert(studyConversation).values(value)
	return toStudyConversation(value)
}

export async function updateStudyConversation(
	database: Database,
	boardID: string,
	userID: string,
	conversationID: string,
	title?: string
): Promise<StudyConversation | null> {
	const [row] = await database
		.update(studyConversation)
		.set({ updatedAt: new Date(), ...(title && { title }) })
		.where(
			and(
				eq(studyConversation.id, conversationID),
				eq(studyConversation.boardID, boardID),
				eq(studyConversation.userID, userID)
			)
		)
		.returning()
	return row ? toStudyConversation(row) : null
}

export async function getStudyConversationByAgentName(
	database: Database,
	agentName: string,
	userID: string
) {
	const [row] = await database
		.select({ boardID: studyConversation.boardID })
		.from(studyConversation)
		.where(and(eq(studyConversation.agentName, agentName), eq(studyConversation.userID, userID)))
		.limit(1)
	return row ?? null
}

export async function getStudyConversation(
	database: Database,
	boardID: string,
	conversationID: string,
	userID: string
) {
	const [row] = await database
		.select({ agentName: studyConversation.agentName })
		.from(studyConversation)
		.where(
			and(
				eq(studyConversation.id, conversationID),
				eq(studyConversation.boardID, boardID),
				eq(studyConversation.userID, userID)
			)
		)
		.limit(1)
	return row ?? null
}

function selectConversations(database: Database, boardID: string, userID: string) {
	return database
		.select()
		.from(studyConversation)
		.where(and(eq(studyConversation.boardID, boardID), eq(studyConversation.userID, userID)))
		.orderBy(desc(studyConversation.updatedAt))
}

function toStudyConversation(value: typeof studyConversation.$inferSelect): StudyConversation {
	return {
		agentName: value.agentName,
		boardID: value.boardID,
		createdAt: value.createdAt.toISOString(),
		id: value.id,
		title: value.title,
		updatedAt: value.updatedAt.toISOString(),
	}
}
