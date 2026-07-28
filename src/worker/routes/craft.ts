import {
	MAX_CRAFT_DOCUMENT_LINKS,
	craftConnectionInputSchema,
	craftDocumentAppendInputSchema,
	craftDocumentBlocksUpdateInputSchema,
	craftDocumentLinkInputSchema,
	type CraftConnectionStatus,
	type CraftDocumentAppendOutput,
	type CraftDocumentBlocksUpdateOutput,
} from '@agentboard/shared'
import type { IRequest } from 'itty-router'
import { requireSession } from '../auth/session'
import {
	createCraftDocumentLink,
	deleteCraftDocumentLink,
	getCraftDocumentLinkRow,
	listCraftDocumentLinkRows,
	toCraftDocumentLink,
} from '../db/craft'
import { createDatabase, type Database } from '../db/client'
import {
	appendCraftDocumentMarkdown,
	connectCraftAPI,
	deleteCraftConnection,
	getCraftConnection,
	getCraftDocumentMarkdown,
	listCraftDocumentCandidates,
	saveCraftConnection,
	updateCraftDocumentBlocks,
	verifyCraftDocument,
} from '../integrations/craft'
import type { AuthorizedBoardContext } from './documents'

export async function handleCraftConnectionGet(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const connection = await getCraftConnection(env, authentication.session.user.id)
	return Response.json({
		connected: Boolean(connection),
		connectedAt: connection?.connectedAt ?? null,
		spaceName: connection?.spaceName ?? null,
	} satisfies CraftConnectionStatus)
}

export async function handleCraftConnectionPut(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	const input: unknown = await request.json().catch(() => null)
	const parsed = craftConnectionInputSchema.safeParse(input)
	if (!parsed.success) {
		return Response.json({ error: 'Enter the API URL from Craft.' }, { status: 400 })
	}

	try {
		const connection = await connectCraftAPI(parsed.data.apiURL)
		await saveCraftConnection(env, authentication.session.user.id, connection)
		return Response.json({
			connected: true,
			connectedAt: connection.connectedAt,
			spaceName: connection.spaceName,
		} satisfies CraftConnectionStatus)
	} catch (error) {
		return craftErrorResponse(error, 400)
	}
}

export async function handleCraftConnectionDelete(request: IRequest, env: Env) {
	const authentication = await requireSession(request, env)
	if ('response' in authentication) return authentication.response
	await deleteCraftConnection(env, authentication.session.user.id)
	return Response.json({ ok: true })
}

export async function handleCraftDocumentsList(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const rows = await listCraftDocumentLinkRows(createDatabase(env), request.params.boardID)
	return Response.json({
		documents: rows.map((row) => toCraftDocumentLink(row, authorization.userID)),
	})
}

export async function handleCraftCandidatesList(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const connection = await getCraftConnection(env, authorization.userID)
	if (!connection) {
		return Response.json(
			{ error: 'Connect Craft in Settings before adding documents.' },
			{ status: 409 }
		)
	}
	try {
		const candidates = await listCraftDocumentCandidates(
			connection,
			new URL(request.url).searchParams.get('q') ?? ''
		)
		return Response.json({ documents: candidates })
	} catch (error) {
		return craftErrorResponse(error)
	}
}

export async function handleCraftDocumentCreate(
	request: IRequest,
	env: Env,
	_context: ExecutionContext,
	authorization: AuthorizedBoardContext
) {
	const input: unknown = await request.json().catch(() => null)
	const parsed = craftDocumentLinkInputSchema.safeParse(input)
	if (!parsed.success) {
		return Response.json({ error: 'Choose a valid Craft document.' }, { status: 400 })
	}
	const database = createDatabase(env)
	const currentLinks = await listCraftDocumentLinkRows(database, request.params.boardID)
	const existing = currentLinks.find((row) =>
		row.connectionOwnerID === authorization.userID &&
		row.documentID === parsed.data.documentID
	)
	if (existing) {
		return Response.json({ document: toCraftDocumentLink(existing, authorization.userID) })
	}
	if (currentLinks.length >= MAX_CRAFT_DOCUMENT_LINKS) {
		return Response.json(
			{ error: `A board can link up to ${MAX_CRAFT_DOCUMENT_LINKS} Craft documents.` },
			{ status: 409 }
		)
	}
	const connection = await getCraftConnection(env, authorization.userID)
	if (!connection) {
		return Response.json(
			{ error: 'Connect Craft in Settings before adding documents.' },
			{ status: 409 }
		)
	}
	try {
		await verifyCraftDocument(connection, parsed.data.documentID)
		const row = await createCraftDocumentLink(database, {
			boardID: request.params.boardID,
			connectionOwnerID: authorization.userID,
			documentID: parsed.data.documentID,
			title: parsed.data.title,
		})
		return Response.json(
			{ document: toCraftDocumentLink(row, authorization.userID) },
			{ status: 201 }
		)
	} catch (error) {
		return craftErrorResponse(error)
	}
}

export async function handleCraftDocumentDelete(
	request: IRequest,
	env: Env
) {
	const database = createDatabase(env)
	const row = await getCraftDocumentLinkRow(
		database,
		request.params.boardID,
		request.params.linkID
	)
	if (!row) return Response.json({ error: 'Craft document not found.' }, { status: 404 })
	await deleteCraftDocumentLink(database, request.params.boardID, row.id)
	return Response.json({ ok: true })
}

export async function handleCraftDocumentPreview(
	request: IRequest,
	env: Env
) {
	const row = await getCraftDocumentLinkRow(
		createDatabase(env),
		request.params.boardID,
		request.params.linkID
	)
	if (!row) return Response.json({ error: 'Craft document not found.' }, { status: 404 })
	const connection = await getCraftConnection(env, row.connectionOwnerID)
	if (!connection) {
		return Response.json(
			{ error: 'The Craft connection for this document is no longer available.' },
			{ status: 409 }
		)
	}
	try {
		return Response.json({
			markdown: await getCraftDocumentMarkdown(connection, row.documentID),
			title: row.title,
		})
	} catch (error) {
		return craftErrorResponse(error)
	}
}

/**
 * Applies an agent-requested append only through the current user's Craft connection. A linked
 * document owned by another board member remains readable, but their credential cannot be used
 * for someone else's mutation.
 */
export async function appendCraftDocumentForUser(
	env: Env,
	database: Database,
	boardID: string,
	userID: string,
	input: unknown
): Promise<CraftDocumentAppendOutput> {
	const parsed = craftDocumentAppendInputSchema.parse(input)
	const row = await getCraftDocumentLinkRow(database, boardID, parsed.linkID)
	if (!row) throw new Error('That Craft document is not linked to this board.')
	if (row.connectionOwnerID !== userID) {
		throw new Error('Only the person who linked this Craft document can change it.')
	}
	const connection = await getCraftConnection(env, userID)
	if (!connection) throw new Error('Connect Craft in Settings before changing documents.')
	await appendCraftDocumentMarkdown(connection, row.documentID, parsed.markdown)
	return { added: true, title: row.title }
}

/**
 * Applies agent-requested text changes with the same ownership boundary as append operations.
 * The integration client also confirms that each block belongs to this linked document.
 */
export async function updateCraftDocumentBlocksForUser(
	env: Env,
	database: Database,
	boardID: string,
	userID: string,
	input: unknown
): Promise<CraftDocumentBlocksUpdateOutput> {
	const parsed = craftDocumentBlocksUpdateInputSchema.parse(input)
	const row = await getCraftDocumentLinkRow(database, boardID, parsed.linkID)
	if (!row) throw new Error('That Craft document is not linked to this board.')
	if (row.connectionOwnerID !== userID) {
		throw new Error('Only the person who linked this Craft document can change it.')
	}
	const connection = await getCraftConnection(env, userID)
	if (!connection) throw new Error('Connect Craft in Settings before changing documents.')
	await updateCraftDocumentBlocks(connection, row.documentID, parsed.blocks)
	return { title: row.title, updated: parsed.blocks.length }
}

function craftErrorResponse(error: unknown, status = 502) {
	const message = error instanceof Error ? error.message : 'Craft is unavailable right now.'
	return Response.json({ error: message }, { status })
}
