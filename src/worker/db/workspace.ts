import {
	boardRoleSchema,
	invitationRoleSchema,
	type Course,
	type InvitationRole,
	type SpaceInvitation,
	type SpaceInvitationCreated,
	type SpaceInvitationPreview,
	type SpaceMember,
} from '@agentboard/shared'
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import type { Database } from './client'
import {
	board,
	boardInvitation,
	boardMember,
	course,
	user,
} from './schema'

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000

interface CourseInput {
	color: string
	examDate: string | null
	title: string
}

export async function listCourses(database: Database, userID: string): Promise<Course[]> {
	const linkedRows = await database
		.select({ courseID: board.courseID })
		.from(boardMember)
		.innerJoin(board, eq(board.id, boardMember.boardID))
		.where(and(eq(boardMember.userID, userID), isNull(board.archivedAt)))
	const linkedCourseIDs = linkedRows.flatMap(({ courseID }) => courseID ? [courseID] : [])
	const ownershipFilter = linkedCourseIDs.length
		? or(eq(course.ownerID, userID), inArray(course.id, linkedCourseIDs))
		: eq(course.ownerID, userID)
	const rows = await database
		.select()
		.from(course)
		.where(ownershipFilter)
		.orderBy(desc(course.updatedAt))

	return rows.map((row) => toCourse(row, row.ownerID === userID))
}

export async function createCourse(
	database: Database,
	userID: string,
	input: CourseInput,
	now = new Date()
): Promise<Course> {
	const id = crypto.randomUUID()
	await database.insert(course).values({
		id,
		ownerID: userID,
		...input,
		createdAt: now,
		updatedAt: now,
	})
	return {
		id,
		...input,
		editable: true,
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
	}
}

export async function updateCourse(
	database: Database,
	userID: string,
	courseID: string,
	input: Partial<CourseInput>,
	now = new Date()
): Promise<Course | null> {
	const rows = await database
		.update(course)
		.set({ ...input, updatedAt: now })
		.where(and(eq(course.id, courseID), eq(course.ownerID, userID)))
		.returning()
	return rows[0] ? toCourse(rows[0], true) : null
}

export async function removeCourse(database: Database, userID: string, courseID: string) {
	const rows = await database
		.delete(course)
		.where(and(eq(course.id, courseID), eq(course.ownerID, userID)))
		.returning({ id: course.id })
	return rows.length > 0
}

export async function setBoardCourse(
	database: Database,
	userID: string,
	boardID: string,
	courseID: string | null
) {
	if (courseID) {
		const [ownedCourse] = await database
			.select({ id: course.id })
			.from(course)
			.where(and(eq(course.id, courseID), eq(course.ownerID, userID)))
			.limit(1)
		if (!ownedCourse) return false
	}
	await database
		.update(board)
		.set({ courseID, updatedAt: new Date() })
		.where(and(eq(board.id, boardID), eq(board.ownerID, userID)))
	return true
}

export async function listSpaceMembers(
	database: Database,
	boardID: string
): Promise<SpaceMember[]> {
	const rows = await database
		.select({
			createdAt: boardMember.createdAt,
			email: user.email,
			name: user.name,
			role: boardMember.role,
			userID: user.id,
		})
		.from(boardMember)
		.innerJoin(user, eq(user.id, boardMember.userID))
		.where(eq(boardMember.boardID, boardID))

	return rows.map((row) => ({
		...row,
		role: boardRoleSchema.parse(row.role),
		createdAt: row.createdAt.toISOString(),
	}))
}

export async function listSpaceInvitations(
	database: Database,
	boardID: string,
	now = new Date()
): Promise<SpaceInvitation[]> {
	const rows = await database
		.select()
		.from(boardInvitation)
		.where(and(
			eq(boardInvitation.boardID, boardID),
			isNull(boardInvitation.acceptedAt),
			gt(boardInvitation.expiresAt, now)
		))
		.orderBy(desc(boardInvitation.createdAt))

	return rows.map(toSpaceInvitation)
}

/**
 * Creates a single-use invitation. The database stores only the SHA-256 token hash. The raw token
 * is returned once so the owner can copy the link. A missing email creates an unrestricted link.
 */
export async function createSpaceInvitation(
	database: Database,
	boardID: string,
	inviterID: string,
	role: InvitationRole,
	email: string | null,
	now = new Date()
): Promise<SpaceInvitationCreated> {
	const id = crypto.randomUUID()
	const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`
	const tokenHash = await hashInvitationToken(token)
	const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS)
	const normalizedEmail = normalizeInvitationEmail(email)
	await database.insert(boardInvitation).values({
		id,
		boardID,
		inviterID,
		tokenHash,
		targetEmail: normalizedEmail,
		role,
		expiresAt,
		createdAt: now,
	})
	return {
		id,
		token,
		role,
		email: normalizedEmail,
		expiresAt: expiresAt.toISOString(),
		createdAt: now.toISOString(),
	}
}

export async function removeSpaceInvitation(
	database: Database,
	boardID: string,
	invitationID: string
) {
	const rows = await database
		.delete(boardInvitation)
		.where(and(eq(boardInvitation.id, invitationID), eq(boardInvitation.boardID, boardID)))
		.returning({ id: boardInvitation.id })
	return rows.length > 0
}

export async function updateSpaceMemberRole(
	database: Database,
	boardID: string,
	userID: string,
	role: InvitationRole
) {
	const rows = await database
		.update(boardMember)
		.set({ role })
		.where(and(
			eq(boardMember.boardID, boardID),
			eq(boardMember.userID, userID),
			or(eq(boardMember.role, 'editor'), eq(boardMember.role, 'viewer'))
		))
		.returning({ userID: boardMember.userID })
	return rows.length > 0
}

export async function removeSpaceMember(
	database: Database,
	boardID: string,
	userID: string
) {
	const rows = await database
		.delete(boardMember)
		.where(and(
			eq(boardMember.boardID, boardID),
			eq(boardMember.userID, userID),
			or(eq(boardMember.role, 'editor'), eq(boardMember.role, 'viewer'))
		))
		.returning({ userID: boardMember.userID })
	return rows.length > 0
}

export async function getSpaceInvitationPreview(
	database: Database,
	token: string,
	now = new Date()
): Promise<SpaceInvitationPreview | null> {
	const tokenHash = await hashInvitationToken(token)
	const [row] = await database
		.select({
			boardTitle: board.title,
			email: boardInvitation.targetEmail,
			expiresAt: boardInvitation.expiresAt,
			role: boardInvitation.role,
		})
		.from(boardInvitation)
		.innerJoin(board, eq(board.id, boardInvitation.boardID))
		.where(and(
			eq(boardInvitation.tokenHash, tokenHash),
			isNull(boardInvitation.acceptedAt),
			gt(boardInvitation.expiresAt, now),
			isNull(board.archivedAt)
		))
		.limit(1)
	return row ? {
		...row,
		role: invitationRoleSchema.parse(row.role),
		expiresAt: row.expiresAt.toISOString(),
	} : null
}

/**
 * Accepts an invitation for the authenticated account. Email invitations require an exact,
 * case-insensitive email match. Existing owners keep ownership, and existing members receive the
 * invited role. The invitation becomes unusable after a successful membership write.
 */
export async function acceptSpaceInvitation(
	database: Database,
	token: string,
	userID: string,
	userEmail: string,
	now = new Date()
): Promise<
	| { kind: 'accepted'; boardID: string }
	| { kind: 'email-mismatch' }
	| { kind: 'not-found' }
> {
	const tokenHash = await hashInvitationToken(token)
	const [invitation] = await database
		.select()
		.from(boardInvitation)
		.innerJoin(board, eq(board.id, boardInvitation.boardID))
		.where(and(
			eq(boardInvitation.tokenHash, tokenHash),
			isNull(boardInvitation.acceptedAt),
			gt(boardInvitation.expiresAt, now),
			isNull(board.archivedAt)
		))
		.limit(1)
	if (!invitation) return { kind: 'not-found' }
	const invitationRow = invitation.boardInvitation
	if (
		invitationRow.targetEmail &&
		invitationRow.targetEmail !== normalizeInvitationEmail(userEmail)
	) return { kind: 'email-mismatch' }

	const [existing] = await database
		.select({ role: boardMember.role })
		.from(boardMember)
		.where(and(
			eq(boardMember.boardID, invitationRow.boardID),
			eq(boardMember.userID, userID)
		))
		.limit(1)
	const membership = existing?.role === 'owner'
		? null
		: database
			.insert(boardMember)
			.values({
				boardID: invitationRow.boardID,
				userID,
				role: invitationRow.role,
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: [boardMember.boardID, boardMember.userID],
				set: { role: invitationRow.role },
			})
	const accept = database
		.update(boardInvitation)
		.set({ acceptedAt: now })
		.where(and(
			eq(boardInvitation.id, invitationRow.id),
			isNull(boardInvitation.acceptedAt)
		))
	if (membership) await database.batch([membership, accept])
	else await accept
	return { kind: 'accepted', boardID: invitationRow.boardID }
}

export function normalizeInvitationEmail(email: string | null | undefined) {
	const normalized = email?.trim().toLowerCase()
	return normalized || null
}

export async function hashInvitationToken(token: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function toCourse(row: typeof course.$inferSelect, editable: boolean): Course {
	return {
		color: row.color,
		createdAt: row.createdAt.toISOString(),
		editable,
		examDate: row.examDate,
		id: row.id,
		title: row.title,
		updatedAt: row.updatedAt.toISOString(),
	}
}

function toSpaceInvitation(row: typeof boardInvitation.$inferSelect): SpaceInvitation {
	return {
		createdAt: row.createdAt.toISOString(),
		email: row.targetEmail,
		expiresAt: row.expiresAt.toISOString(),
		id: row.id,
		role: invitationRoleSchema.parse(row.role),
	}
}
