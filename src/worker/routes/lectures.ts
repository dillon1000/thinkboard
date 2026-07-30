import {
	MAX_AUDIO_BYTES,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import {
	createLecture,
	getLecture,
	getLectureRow,
	listLectures,
	removeLecture,
	toLectureSummary,
} from '../db/lectures'
import { createDatabase } from '../db/client'
import { processLecture } from '../lectures/pipeline'
import type { AuthorizedBoardContext } from './documents'

const ALLOWED_AUDIO_TYPES = new Set([
	'audio/aac',
	'audio/flac',
	'audio/m4a',
	'audio/mp3',
	'audio/mp4',
	'audio/mpeg',
	'audio/ogg',
	'audio/wav',
	'audio/webm',
	'video/webm',
])

export async function handleLectures(
	request: IRequest,
	env: Env,
	ctx: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const database = createDatabase(env)
	const boardID = request.params.boardID
	if (request.method === 'GET') {
		return Response.json({ lectures: await listLectures(database, boardID) })
	}

	const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
	if (!ALLOWED_AUDIO_TYPES.has(mediaType)) {
		return Response.json({ error: 'Choose an MP3, M4A, WAV, OGG, FLAC, or WebM recording' }, {
			status: 400,
		})
	}
	const declaredBytes = Number(request.headers.get('content-length'))
	if (Number.isFinite(declaredBytes) && declaredBytes > MAX_AUDIO_BYTES) {
		return Response.json({ error: 'Audio files must be 20 MB or smaller' }, { status: 413 })
	}
	const bytes = await request.arrayBuffer()
	if (!bytes.byteLength) return Response.json({ error: 'The audio file is empty' }, { status: 400 })
	if (bytes.byteLength > MAX_AUDIO_BYTES) {
		return Response.json({ error: 'Audio files must be 20 MB or smaller' }, { status: 413 })
	}
	const title = new URL(request.url).searchParams.get('title')?.trim().slice(0, 180)
	if (!title) return Response.json({ error: 'A lecture title is required' }, { status: 400 })

	const id = crypto.randomUUID()
	const r2Key = `boards/${safePathPart(boardID)}/lectures/${id}`
	await env.TLDRAW_BUCKET.put(r2Key, bytes, {
		httpMetadata: { contentType: mediaType },
	})
	const row = await createLecture(database, {
		boardID,
		byteSize: bytes.byteLength,
		id,
		mediaType,
		ownerID: authorization.userID,
		r2Key,
		title,
	})
	if (!row) {
		await env.TLDRAW_BUCKET.delete(r2Key)
		return Response.json({ error: 'Unable to save this lecture' }, { status: 500 })
	}
	ctx.waitUntil(processLecture(env, boardID, id, ctx).catch((error) => {
		console.error(JSON.stringify({
			boardID,
			error: error instanceof Error ? error.message : 'Unknown lecture processing error',
			lectureID: id,
			pipeline: 'lecture-ingestion',
		}))
	}))
	return Response.json({ lecture: toLectureSummary(row) }, { status: 202 })
}

export async function handleLecture(
	request: IRequest,
	env: Env
) {
	const database = createDatabase(env)
	const boardID = request.params.boardID
	const lectureID = request.params.lectureID
	if (request.method === 'GET') {
		const result = await getLecture(database, boardID, lectureID)
		return result
			? Response.json({ lecture: result })
			: Response.json({ error: 'Lecture not found' }, { status: 404 })
	}
	const removed = await removeLecture(database, boardID, lectureID)
	if (!removed) return Response.json({ error: 'Lecture not found' }, { status: 404 })
	await Promise.all([
		env.TLDRAW_BUCKET.delete(removed.r2Key),
		removed.vectorIDs.length
			? env.DOCUMENT_VECTORS.deleteByIds(removed.vectorIDs)
			: Promise.resolve(),
	])
	return Response.json({ removed: true })
}

export async function handleLectureAudio(request: IRequest, env: Env) {
	const row = await getLectureRow(
		createDatabase(env),
		request.params.boardID,
		request.params.lectureID
	)
	if (!row) return Response.json({ error: 'Lecture not found' }, { status: 404 })
	const object = await env.TLDRAW_BUCKET.get(row.r2Key, {
		range: request.headers,
		onlyIf: request.headers,
	})
	if (!object) return Response.json({ error: 'Lecture audio not found' }, { status: 404 })

	const headers = new Headers({
		'accept-ranges': 'bytes',
		'cache-control': 'private, max-age=3600',
		'content-security-policy': "default-src 'none'",
		'content-type': row.mediaType,
		'x-content-type-options': 'nosniff',
	})
	object.writeHttpMetadata(headers)
	let contentRange: string | undefined
	if (object.range) {
		if ('suffix' in object.range) {
			contentRange = `bytes ${object.size - object.range.suffix}-${object.size - 1}/${object.size}`
		} else {
			const start = object.range.offset ?? 0
			const end = object.range.length ? start + object.range.length - 1 : object.size - 1
			if (start !== 0 || end !== object.size - 1) {
				contentRange = `bytes ${start}-${end}/${object.size}`
			}
		}
	}
	if (contentRange) headers.set('content-range', contentRange)
	const body = 'body' in object && object.body ? object.body : null
	const status = body ? (contentRange ? 206 : 200) : 304
	return new Response(body, { headers, status })
}

function safePathPart(value: string) {
	return value.replace(/[^a-zA-Z0-9_-]+/g, '_')
}
