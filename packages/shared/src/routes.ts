export const apiRoutePatterns = {
	boardSocket: '/api/connect/:boardID',
	boardContext: '/api/boards/:boardID/context',
	boardInlineAgent: '/api/boards/:boardID/inline',
	boardLockInReview: '/api/boards/:boardID/lock-in/review',
	boardActiveRecallGrade: '/api/boards/:boardID/active-recall/grade',
	boardFlashcards: '/api/boards/:boardID/flashcards',
	boardFlashcard: '/api/boards/:boardID/flashcards/:shapeID',
	boardAgentActions: '/api/boards/:boardID/agent-actions',
	boardAgentActionUndo: '/api/boards/:boardID/agent-actions/:actionID/undo',
	boardArtifacts: '/api/boards/:boardID/artifacts',
	boardArtifact: '/api/boards/:boardID/artifacts/:shapeID',
	boardMistakes: '/api/boards/:boardID/mistakes',
	boardMemories: '/api/boards/:boardID/memories',
	boardDocuments: '/api/boards/:boardID/documents',
	boardDocument: '/api/boards/:boardID/documents/:documentID',
	boardDocumentComplete: '/api/boards/:boardID/documents/:documentID/complete',
	boardDocumentOriginal: '/api/boards/:boardID/documents/:documentID/original',
	boardDocumentPage: '/api/boards/:boardID/documents/:documentID/pages/:pageNumber',
	boardDocumentRetry: '/api/boards/:boardID/documents/:documentID/retry',
	boardDocumentStatus: '/api/boards/:boardID/documents/:documentID/status',
	boardCourse: '/api/boards/:boardID/course',
	boardMembers: '/api/boards/:boardID/members',
	boardMember: '/api/boards/:boardID/members/:userID',
	boardInvitations: '/api/boards/:boardID/invitations',
	boardInvitation: '/api/boards/:boardID/invitations/:invitationID',
	board: '/api/boards/:boardID',
	boardRestore: '/api/boards/:boardID/restore',
	boards: '/api/boards',
	archivedBoards: '/api/boards/archived',
	courses: '/api/courses',
	course: '/api/courses/:courseID',
	invitation: '/api/invitations/:token',
	studyReviews: '/api/study/reviews',
	studyReview: '/api/study/reviews/:reviewID',
	studyAnswerAttempts: '/api/study/answer-attempts',
	studyAnswerAttempt: '/api/study/answer-attempts/:attemptID',
	studyAnswerAttemptComplete: '/api/study/answer-attempts/:attemptID/complete',
	studyCardAnswerAttempts: '/api/study/cards/:boardID/:shapeID/answer-attempts',
	studyToday: '/api/study/today',
	examPlans: '/api/study/exams',
	examPlan: '/api/study/exams/:examID',
	examPractice: '/api/study/exams/:examID/practice',
	globalSearch: '/api/search',
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
	today: '/today',
	board: (boardID: string) => `/boards/${encodeURIComponent(boardID)}`,
	invitation: (token: string) => `/invite/${encodeURIComponent(token)}`,
} as const

export const apiRoutes = {
	boards: '/api/boards',
	archivedBoards: '/api/boards/archived',
	courses: '/api/courses',
	course: (courseID: string) => `/api/courses/${encodeURIComponent(courseID)}`,
	board: (boardID: string) => `/api/boards/${encodeURIComponent(boardID)}`,
	boardRestore: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/restore`,
	boardContext: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/context`,
	boardInlineAgent: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/inline`,
	boardLockInReview: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/lock-in/review`,
	boardActiveRecallGrade: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/active-recall/grade`,
	boardFlashcards: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/flashcards`,
	boardFlashcard: (boardID: string, shapeID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/flashcards/${encodeURIComponent(shapeID)}`,
	boardAgentActions: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/agent-actions`,
	boardAgentActionUndo: (boardID: string, actionID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/agent-actions/${encodeURIComponent(actionID)}/undo`,
	boardArtifacts: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/artifacts`,
	boardArtifact: (boardID: string, shapeID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/artifacts/${encodeURIComponent(shapeID)}`,
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
	boardCourse: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/course`,
	boardMembers: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/members`,
	boardMember: (boardID: string, userID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/members/${encodeURIComponent(userID)}`,
	boardInvitations: (boardID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/invitations`,
	boardInvitation: (boardID: string, invitationID: string) =>
		`/api/boards/${encodeURIComponent(boardID)}/invitations/${encodeURIComponent(invitationID)}`,
	invitation: (token: string) => `/api/invitations/${encodeURIComponent(token)}`,
	studyReviews: '/api/study/reviews',
	studyReview: (reviewID: string) => `/api/study/reviews/${encodeURIComponent(reviewID)}`,
	studyAnswerAttempts: '/api/study/answer-attempts',
	studyAnswerAttempt: (attemptID: string) =>
		`/api/study/answer-attempts/${encodeURIComponent(attemptID)}`,
	studyAnswerAttemptComplete: (attemptID: string) =>
		`/api/study/answer-attempts/${encodeURIComponent(attemptID)}/complete`,
	studyCardAnswerAttempts: (boardID: string, shapeID: string) =>
		`/api/study/cards/${encodeURIComponent(boardID)}/${encodeURIComponent(shapeID)}/answer-attempts`,
	studyToday: '/api/study/today',
	examPlans: '/api/study/exams',
	examPlan: (examID: string) => `/api/study/exams/${encodeURIComponent(examID)}`,
	examPractice: (examID: string) =>
		`/api/study/exams/${encodeURIComponent(examID)}/practice`,
	globalSearch: (query: string) => `/api/search?q=${encodeURIComponent(query)}`,
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
