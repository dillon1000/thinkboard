import { apiRoutePatterns } from '@agentboard/shared'
import { handleUnfurlRequest } from 'cloudflare-workers-unfurl'
import { AutoRouter, error, type IRequest } from 'itty-router'
import { createAuth } from './auth/createAuth'
import { getPublicConfig } from './config'
import { requireSession } from './auth/session'
import { getBoardAccess } from './db/boards'
import { createDatabase } from './db/client'
import { StudyAgent } from './agents/StudyAgent'
import { handleAssetDownload, handleAssetUpload } from './routes/assets'
import {
	handleBoardArchive,
	handleBoardCreate,
	handleBoardGet,
	handleBoardRename,
	handleBoardsList,
} from './routes/boards'
import {
	handleStudyConversationCreate,
	handleStudyConversationTitle,
	handleStudyConversationUpdate,
	handleStudyConversationsList,
} from './routes/studyConversations'
import { handleSpotifyPlayerAction, handleSpotifyPlayerGet } from './routes/spotify'
import { handleInlineAgentRequest, handleStudyConversationMessages } from './routes/studyChat'
import { handleLockInReview } from './routes/lockIn'
import {
	handleBoardMemoryCreate,
	handleBoardMistakes,
	handleDueFlashcards,
	handleFlashcardRegistration,
	handleFlashcardReview,
	handleAgentProfileGet,
	handleAgentProfilePut,
	handleStudyMemory,
	handleStudyMemoryCreate,
	handleStudyMemoryDelete,
} from './routes/studyLearning'
import {
	handleDocumentComplete,
	handleDocumentCreate,
	handleDocumentDelete,
	handleDocumentGet,
	handleDocumentOriginalDownload,
	handleDocumentPageDownload,
	handleDocumentPageUpload,
	handleDocumentRetry,
	handleDocumentsList,
	handleDocumentStatus,
	type AuthorizedBoardContext,
} from './routes/documents'
import { processDocumentBatch } from './documents/pipeline'
import type { DocumentPipelineMessage } from './documents/types'
import {
	handleCraftCandidatesList,
	handleCraftConnectionDelete,
	handleCraftConnectionGet,
	handleCraftConnectionPut,
	handleCraftDocumentCreate,
	handleCraftDocumentDelete,
	handleCraftDocumentPreview,
	handleCraftDocumentsList,
	handleCraftWhiteboardGet,
	handleCraftWhiteboardPut,
	handleCraftWhiteboardsList,
} from './routes/craft'

export { BoardRoom } from './durable-objects/BoardRoom'
export { StudyAgent }

const router = AutoRouter<IRequest, [env: Env, ctx: ExecutionContext]>({
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	.get(apiRoutePatterns.config, (_request, env) => {
		return Response.json(getPublicConfig(env))
	})
	.get(apiRoutePatterns.spotifyPlayer, handleSpotifyPlayerGet)
	.post(apiRoutePatterns.spotifyPlayer, handleSpotifyPlayerAction)
	.get('/api/integrations/craft', handleCraftConnectionGet)
	.put('/api/integrations/craft', handleCraftConnectionPut)
	.delete('/api/integrations/craft', handleCraftConnectionDelete)
	.get(apiRoutePatterns.boards, handleBoardsList)
	.post(apiRoutePatterns.boards, handleBoardCreate)
	.get(apiRoutePatterns.studyConversations, handleStudyConversationsList)
	.post(apiRoutePatterns.studyConversations, handleStudyConversationCreate)
	.get(apiRoutePatterns.studyConversationMessages, handleStudyConversationMessages)
	.post(apiRoutePatterns.studyConversationMessages, handleStudyConversationMessages)
	.post(apiRoutePatterns.boardInlineAgent, handleInlineAgentRequest)
	.post(apiRoutePatterns.boardLockInReview, handleLockInReview)
	.patch(apiRoutePatterns.studyConversation, handleStudyConversationUpdate)
	.post(apiRoutePatterns.studyConversationTitle, handleStudyConversationTitle)
	.get(apiRoutePatterns.studyReviews, handleDueFlashcards)
	.post(apiRoutePatterns.studyReview, handleFlashcardReview)
	.get(apiRoutePatterns.studyMemory, handleStudyMemory)
	.post(apiRoutePatterns.studyMemory, handleStudyMemoryCreate)
	.delete(apiRoutePatterns.studyMemoryItem, handleStudyMemoryDelete)
	.get(apiRoutePatterns.studyAgentProfile, handleAgentProfileGet)
	.put(apiRoutePatterns.studyAgentProfile, handleAgentProfilePut)
	.post(apiRoutePatterns.boardFlashcards, handleFlashcardRegistration)
	.post(apiRoutePatterns.boardMemories, handleBoardMemoryCreate)
	.get(apiRoutePatterns.boardMistakes, handleBoardMistakes)
	.post(apiRoutePatterns.boardMistakes, handleBoardMistakes)
	.get(apiRoutePatterns.boardDocuments, authorizeBoardRequest(handleDocumentsList))
	.post(apiRoutePatterns.boardDocuments, authorizeBoardRequest(handleDocumentCreate))
	.get(apiRoutePatterns.boardDocumentStatus, authorizeBoardRequest(handleDocumentStatus))
	.post(apiRoutePatterns.boardDocumentComplete, authorizeBoardRequest(handleDocumentComplete))
	.post(apiRoutePatterns.boardDocumentRetry, authorizeBoardRequest(handleDocumentRetry))
	.get(apiRoutePatterns.boardDocumentOriginal, authorizeBoardRequest(handleDocumentOriginalDownload))
	.get(apiRoutePatterns.boardDocumentPage, authorizeBoardRequest(handleDocumentPageDownload))
	.put(apiRoutePatterns.boardDocumentPage, authorizeBoardRequest(handleDocumentPageUpload))
	.get(apiRoutePatterns.boardDocument, authorizeBoardRequest(handleDocumentGet))
	.delete(apiRoutePatterns.boardDocument, authorizeBoardRequest(handleDocumentDelete))
	.get('/api/boards/:boardID/craft/candidates', authorizeBoardRequest(handleCraftCandidatesList))
	.get('/api/boards/:boardID/craft/documents', authorizeBoardRequest(handleCraftDocumentsList))
	.post('/api/boards/:boardID/craft/documents', authorizeBoardRequest(handleCraftDocumentCreate))
	.get(
		'/api/boards/:boardID/craft/whiteboards',
		authorizeBoardRequest(handleCraftWhiteboardsList)
	)
	.get(
		'/api/boards/:boardID/craft/whiteboards/:whiteboardBlockID',
		authorizeBoardRequest(handleCraftWhiteboardGet)
	)
	.put(
		'/api/boards/:boardID/craft/whiteboards/:whiteboardBlockID',
		authorizeBoardRequest(handleCraftWhiteboardPut)
	)
	.get(
		'/api/boards/:boardID/craft/documents/:linkID/preview',
		authorizeBoardRequest(handleCraftDocumentPreview)
	)
	.delete(
		'/api/boards/:boardID/craft/documents/:linkID',
		authorizeBoardRequest(handleCraftDocumentDelete)
	)
	.get(apiRoutePatterns.boardContext, async (request, env) => {
		const authentication = await requireSession(request, env)
		if ('response' in authentication) return authentication.response
		const access = await getBoardAccess(
			createDatabase(env),
			request.params.boardID,
			authentication.session.user.id
		)
		if (!access) return Response.json({ error: 'Board not found' }, { status: 404 })

		const room = env.BOARD_ROOM.getByName(request.params.boardID)
		return room.fetch(request.url, { headers: request.headers })
	})
	.get(apiRoutePatterns.board, handleBoardGet)
	.patch(apiRoutePatterns.board, handleBoardRename)
	.delete(apiRoutePatterns.board, handleBoardArchive)
	.get(apiRoutePatterns.boardSocket, async (request, env) => {
		const authentication = await requireSession(request, env)
		if ('response' in authentication) return authentication.response
		const access = await getBoardAccess(
			createDatabase(env),
			request.params.boardID,
			authentication.session.user.id
		)
		if (!access) return Response.json({ error: 'Board not found' }, { status: 404 })

		const room = env.BOARD_ROOM.getByName(request.params.boardID)
		return room.fetch(request.url, { headers: request.headers, body: request.body })
	})
	.post(apiRoutePatterns.asset, authorizeBoardRequest(handleAssetUpload))
	.get(apiRoutePatterns.asset, authorizeBoardRequest(handleAssetDownload))
	.get(apiRoutePatterns.bookmarkPreview, async (request, env) => {
		const authentication = await requireSession(request, env)
		if ('response' in authentication) return authentication.response
		return handleUnfurlRequest(request)
	})
	.all('*', () => {
		return new Response('Not found', { status: 404 })
	})

export default {
	async fetch(request, env, ctx) {
		const pathname = new URL(request.url).pathname
		if (pathname.startsWith('/api/auth/')) {
			return createAuth(request, env).handler(request)
		}

		return router.fetch(request, env, ctx)
	},
	async queue(batch, env) {
		await processDocumentBatch(batch, env)
	},
} satisfies ExportedHandler<Env, DocumentPipelineMessage>

type BoardRequestHandler = (
	request: IRequest,
	env: Env,
	ctx: ExecutionContext,
	authorization: AuthorizedBoardContext
) => Response | Promise<Response> | object | Promise<object>

function authorizeBoardRequest(handler: BoardRequestHandler) {
	return async (request: IRequest, env: Env, ctx: ExecutionContext) => {
		const authentication = await requireSession(request, env)
		if ('response' in authentication) return authentication.response
		const access = await getBoardAccess(
			createDatabase(env),
			request.params.boardID,
			authentication.session.user.id
		)
		if (!access) return Response.json({ error: 'Board not found' }, { status: 404 })
		if (request.method !== 'GET' && request.method !== 'HEAD' && access.role === 'viewer') {
			return Response.json({ error: 'Forbidden' }, { status: 403 })
		}
		return handler(request, env, ctx, {
			role: access.role,
			userID: authentication.session.user.id,
		})
	}
}
