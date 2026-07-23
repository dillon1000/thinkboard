import type { Board, BoardRole } from '@agentboard/shared'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Database } from './client'
import { board, boardMember } from './schema'

export interface BoardAccess {
	boardID: string
	role: BoardRole
}

export async function listBoards(database: Database, userID: string): Promise<Board[]> {
	const rows = await database
		.select({
			id: board.id,
			title: board.title,
			role: boardMember.role,
			createdAt: board.createdAt,
			updatedAt: board.updatedAt,
		})
		.from(boardMember)
		.innerJoin(board, eq(board.id, boardMember.boardID))
		.where(and(eq(boardMember.userID, userID), isNull(board.archivedAt)))
		.orderBy(desc(board.updatedAt))

	return rows.map((row) => ({
		...row,
		role: row.role as BoardRole,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	}))
}

export async function createBoard(database: Database, userID: string, title: string): Promise<Board> {
	const id = crypto.randomUUID()
	const now = new Date()

	await database.batch([
		database.insert(board).values({ id, title, ownerID: userID, createdAt: now, updatedAt: now }),
		database
			.insert(boardMember)
			.values({ boardID: id, userID, role: 'owner', createdAt: now }),
	])

	return {
		id,
		title,
		role: 'owner',
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
	}
}

export async function getBoardAccess(
	database: Database,
	boardID: string,
	userID: string
): Promise<BoardAccess | null> {
	const [membership] = await database
		.select({ boardID: boardMember.boardID, role: boardMember.role })
		.from(boardMember)
		.innerJoin(board, eq(board.id, boardMember.boardID))
		.where(
			and(eq(boardMember.boardID, boardID), eq(boardMember.userID, userID), isNull(board.archivedAt))
		)
		.limit(1)

	return membership ? { boardID: membership.boardID, role: membership.role as BoardRole } : null
}

export async function getBoard(database: Database, boardID: string, userID: string): Promise<Board | null> {
	const [row] = await database
		.select({
			id: board.id,
			title: board.title,
			role: boardMember.role,
			createdAt: board.createdAt,
			updatedAt: board.updatedAt,
		})
		.from(boardMember)
		.innerJoin(board, eq(board.id, boardMember.boardID))
		.where(and(eq(board.id, boardID), eq(boardMember.userID, userID), isNull(board.archivedAt)))
		.limit(1)

	return row
		? {
				...row,
				role: row.role as BoardRole,
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			}
		: null
}

export async function renameBoard(database: Database, boardID: string, title: string) {
	await database.update(board).set({ title, updatedAt: new Date() }).where(eq(board.id, boardID))
}

export async function archiveBoard(database: Database, boardID: string) {
	const now = new Date()
	await database.update(board).set({ archivedAt: now, updatedAt: now }).where(eq(board.id, boardID))
}

export async function isBoardActive(database: Database, boardID: string) {
	const [row] = await database
		.select({ id: board.id })
		.from(board)
		.where(and(eq(board.id, boardID), isNull(board.archivedAt)))
		.limit(1)
	return Boolean(row)
}
