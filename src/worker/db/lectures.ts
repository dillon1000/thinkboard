import type {
	Lecture,
	LectureSegment,
	LectureSummary,
} from '@agentboard/shared'
import { and, desc, eq } from 'drizzle-orm'
import type { Database } from './client'
import { lecture, lectureChunk } from './schema'

const D1_MAX_BOUND_PARAMETERS = 100
const LECTURE_CHUNK_PARAMETERS_PER_ROW = 4
const LECTURE_CHUNK_BATCH_SIZE = Math.floor(
	D1_MAX_BOUND_PARAMETERS / LECTURE_CHUNK_PARAMETERS_PER_ROW
)

export async function createLecture(
	database: Database,
	input: {
		boardID: string
		byteSize: number
		id: string
		mediaType: string
		ownerID: string
		r2Key: string
		title: string
	},
	now = new Date()
) {
	await database.insert(lecture).values({
		...input,
		createdAt: now,
		segments: [],
		status: 'processing',
		transcript: '',
		updatedAt: now,
	})
	return getLectureRow(database, input.boardID, input.id)
}

export async function listLectures(
	database: Database,
	boardID: string
): Promise<LectureSummary[]> {
	const rows = await database
		.select()
		.from(lecture)
		.where(eq(lecture.boardID, boardID))
		.orderBy(desc(lecture.createdAt))
	return rows.map(toLectureSummary)
}

export async function getLecture(
	database: Database,
	boardID: string,
	lectureID: string
): Promise<Lecture | null> {
	const row = await getLectureRow(database, boardID, lectureID)
	return row ? toLecture(row) : null
}

export async function getLectureRow(
	database: Database,
	boardID: string,
	lectureID: string
) {
	const [row] = await database
		.select()
		.from(lecture)
		.where(and(eq(lecture.boardID, boardID), eq(lecture.id, lectureID)))
		.limit(1)
	return row ?? null
}

export async function completeLecture(
	database: Database,
	boardID: string,
	lectureID: string,
	input: {
		durationSeconds: number | null
		segments: LectureSegment[]
		transcript: string
	},
	now = new Date()
) {
	await database
		.update(lecture)
		.set({
			...input,
			failureReason: null,
			status: 'ready',
			updatedAt: now,
		})
		.where(and(eq(lecture.boardID, boardID), eq(lecture.id, lectureID)))
}

export async function failLecture(
	database: Database,
	boardID: string,
	lectureID: string,
	reason: string,
	now = new Date()
) {
	await database
		.update(lecture)
		.set({
			failureReason: reason.slice(0, 500),
			status: 'failed',
			updatedAt: now,
		})
		.where(and(eq(lecture.boardID, boardID), eq(lecture.id, lectureID)))
}

export async function listLectureVectorIDs(database: Database, lectureID: string) {
	const rows = await database
		.select({ vectorID: lectureChunk.vectorID })
		.from(lectureChunk)
		.where(eq(lectureChunk.lectureID, lectureID))
	return rows.map(({ vectorID }) => vectorID)
}

export async function replaceLectureChunks(
	database: Database,
	lectureID: string,
	chunks: ReadonlyArray<{
		endSecond: number
		startSecond: number
		vectorID: string
	}>
) {
	await database.delete(lectureChunk).where(eq(lectureChunk.lectureID, lectureID))
	for (let offset = 0; offset < chunks.length; offset += LECTURE_CHUNK_BATCH_SIZE) {
		const batch = chunks.slice(offset, offset + LECTURE_CHUNK_BATCH_SIZE)
		if (batch.length) {
			await database.insert(lectureChunk).values(
				batch.map((chunk) => ({ ...chunk, lectureID }))
			)
		}
	}
}

export async function removeLecture(
	database: Database,
	boardID: string,
	lectureID: string
) {
	const row = await getLectureRow(database, boardID, lectureID)
	if (!row) return null
	const vectorIDs = await listLectureVectorIDs(database, lectureID)
	await database.delete(lecture).where(and(
		eq(lecture.boardID, boardID),
		eq(lecture.id, lectureID)
	))
	return { r2Key: row.r2Key, vectorIDs }
}

export function toLectureSummary(row: typeof lecture.$inferSelect): LectureSummary {
	return {
		byteSize: row.byteSize,
		createdAt: row.createdAt.toISOString(),
		durationSeconds: row.durationSeconds,
		failureReason: row.failureReason,
		id: row.id,
		mediaType: row.mediaType,
		status: row.status,
		title: row.title,
		updatedAt: row.updatedAt.toISOString(),
	}
}

function toLecture(row: typeof lecture.$inferSelect): Lecture {
	return {
		...toLectureSummary(row),
		segments: row.segments,
		transcript: row.transcript,
	}
}
