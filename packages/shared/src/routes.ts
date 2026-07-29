export const apiRoutePatterns = {
	boardSocket: '/api/connect/:boardID',
	boardContext: '/api/boards/:boardID/context',
	boardInlineAgent: '/api/boards/:boardID/inline',
	boardLockInReview: '/api/boards/:boardID/lock-in/review',
	boardFlashcards: '/api/boards/:boardID/flashcards',
	boardMistakes: '/api/boards/:boardID/mistakes',
	boardMemories: '/api/boards/:boardID/memories',
	boardDocuments: '/api/boards/:boardID/documents',
	boardDocument: '/api/boards/:boardID/documents/:documentID',
	boardDocumentComplete: '/api/boards/:boardID/documents/:documentID/complete',
	boardDocumentOriginal: '/api/boards/:boardID/documents/:documentID/original',
	boardDocumentPage: '/api/boards/:boardID/documents/:documentID/pages/:pageNumber',
	boardDocumentRetry: '/api/boards/:boardID/documents/:documentID/retry',
	boardDocumentStatus: '/api/boards/:boardID/documents/:documentID/status',
	board: '/api/boards/:boardID',
	boardRestore: '/api/boards/:boardID/restore',
	boards: '/api/boards',
	archivedBoards: '/api/boards/archived',
	studyReviews: '/api/study/reviews',
	studyReview: '/api/study/reviews/:reviewID',
	studyMemory: '/api/study/memory',
	studyMemoryItem: '/api/study/memory/:memoryKey',
	studyAgentProfile: '/api/study/agent-profile',
	studyConversations: '/api/boards/:boardID/conversations',
	studyConversation: '/api/boards/:boardID/conversations/:conversationID',
	studyConversationMessages: '/api/boards/:boardID/conversations/:conversationID/messages',
	studyConversationTitle: '/api/boards/:boardID/conversations/:conversationID/title',
	asset: '/api/boards/:boardID/assets/:assetID',
	bookmarkPreview: '/api/unfurl',
	config: '/api/config',
	spotifyPlayer: '/api/integrations/spotify/player',
} as const

export const appRoutes = {
	home: '/boards',
	login: '/login',
	memory: '/memory',
	settings: '/settings',
	board: (boardID: string) => `/boards/${encodeURIComponent(boardID)}`,
} as const

export const apiRoutes = {
	boards: '/api/boards',
	archivedBoards: '/api/boards/archived',
	board: (boardID: string) => `/api/boards/${encodeURIComponent(boardID)}`,
	boardRestore: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/restore`,
	boardContext: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/context`,
	boardInlineAgent: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/inline`,
	boardLockInReview: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/lock-in/review`,
	boardFlashcards: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/flashcards`,
	boardMistakes: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/mistakes`,
	boardMemories: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/memories`,
	boardDocuments: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/documents`,
	boardDocument: (boardID: string, documentID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/documents/${encodeURIComponent(documentID)}`,
	boardDocumentComplete: (boardID: string, documentID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/documents/${encodeURIComponent(documentID)}/complete`,
	boardDocumentOriginal: (boardID: string, documentID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/documents/${encodeURIComponent(documentID)}/original`,
	boardDocumentPage: (boardID: string, documentID: string, pageNumber: number) =>
		`/api/boards/${encodeURIComponent(boardID)}/documents/${encodeURIComponent(documentID)}/pages/${pageNumber}`,
	boardDocumentRetry: (boardID: string, documentID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/documents/${encodeURIComponent(documentID)}/retry`,
	boardDocumentStatus: (boardID: string, documentID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/documents/${encodeURIComponent(documentID)}/status`,
	studyReviews: '/api/study/reviews',
	studyReview: (reviewID: string) => `/api/study/reviews/${encodeURIComponent(reviewID)}`,
	studyMemory: '/api/study/memory',
	studyMemoryItem: (memoryKey: string) =>
		`/api/study/memory/${encodeURIComponent(memoryKey)}`,
	studyAgentProfile: '/api/study/agent-profile',
	studyConversations: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/conversations`,
	studyConversation: (boardID: string, conversationID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/conversations/${encodeURIComponent(conversationID)}`,
	studyConversationMessages: (boardID: string, conversationID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/conversations/${encodeURIComponent(conversationID)}/messages`,
	studyConversationTitle: (boardID: string, conversationID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/conversations/${encodeURIComponent(conversationID)}/title`,
	boardSocket: (boardID: string) => `/api/connect/${encodeURIComponent(boardID)}`,
	asset: (boardID: string, assetID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/assets/${encodeURIComponent(assetID)}`,
	bookmarkPreview: (url: string) => `/api/unfurl?url=${encodeURIComponent(url)}`,
	config: '/api/config',
	spotifyPlayer: '/api/integrations/spotify/player',
} as const
