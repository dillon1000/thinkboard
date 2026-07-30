import { relations, sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { LectureSegment } from '@agentboard/shared'

export const user = sqliteTable(
	'user',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
		image: text('image'),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [uniqueIndex('user_email_unique').on(table.email)]
)

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
		token: text('token').notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
		ipAddress: text('ipAddress'),
		userAgent: text('userAgent'),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(table) => [uniqueIndex('session_token_unique').on(table.token), index('session_userId_idx').on(table.userId)]
)

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('accountId').notNull(),
		providerId: text('providerId').notNull(),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('accessToken'),
		refreshToken: text('refreshToken'),
		idToken: text('idToken'),
		accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
		refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('account_userId_idx').on(table.userId)]
)

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
)

export const course = sqliteTable(
	'course',
	{
		id: text('id').primaryKey(),
		ownerID: text('ownerID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		color: text('color').notNull(),
		examDate: text('examDate'),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('course_ownerID_updatedAt_idx').on(table.ownerID, table.updatedAt),
	]
)

export const board = sqliteTable(
	'board',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		courseID: text('courseID').references(() => course.id, { onDelete: 'set null' }),
		ownerID: text('ownerID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
		archivedAt: integer('archivedAt', { mode: 'timestamp' }),
	},
	(table) => [index('board_ownerID_idx').on(table.ownerID), index('board_updatedAt_idx').on(table.updatedAt)]
)

export const boardMember = sqliteTable(
	'boardMember',
	{
		boardID: text('boardID')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		userID: text('userID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.boardID, table.userID] }),
		index('boardMember_userID_idx').on(table.userID),
	]
)

export const boardInvitation = sqliteTable(
	'boardInvitation',
	{
		id: text('id').primaryKey(),
		boardID: text('boardID')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		inviterID: text('inviterID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		tokenHash: text('tokenHash').notNull(),
		targetEmail: text('targetEmail'),
		role: text('role', { enum: ['editor', 'viewer'] }).notNull(),
		expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
		acceptedAt: integer('acceptedAt', { mode: 'timestamp' }),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('boardInvitation_tokenHash_unique').on(table.tokenHash),
		index('boardInvitation_boardID_createdAt_idx').on(table.boardID, table.createdAt),
	]
)

export const studyConversation = sqliteTable(
	'studyConversation',
	{
		id: text('id').primaryKey(),
		agentName: text('agentName').notNull(),
		boardID: text('boardID')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		userID: text('userID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('studyConversation_agentName_unique').on(table.agentName),
		index('studyConversation_boardID_userID_updatedAt_idx').on(
			table.boardID,
			table.userID,
			table.updatedAt
		),
	]
)

export const flashcardReview = sqliteTable(
	'flashcardReview',
	{
		id: text('id').primaryKey(),
		userID: text('userID').notNull().references(() => user.id, { onDelete: 'cascade' }),
		boardID: text('boardID').notNull().references(() => board.id, { onDelete: 'cascade' }),
		shapeID: text('shapeID').notNull(),
		front: text('front').notNull(),
		back: text('back').notNull(),
		alternateAnswers: text('alternateAnswers', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		easeFactor: real('easeFactor').notNull().default(2.5),
		intervalDays: integer('intervalDays').notNull().default(0),
		repetition: integer('repetition').notNull().default(0),
		reviewCount: integer('reviewCount').notNull().default(0),
		nextReviewAt: integer('nextReviewAt', { mode: 'timestamp' }).notNull(),
		lastReviewedAt: integer('lastReviewedAt', { mode: 'timestamp' }),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('flashcardReview_userID_boardID_shapeID_unique').on(
			table.userID,
			table.boardID,
			table.shapeID
		),
		index('flashcardReview_userID_nextReviewAt_idx').on(table.userID, table.nextReviewAt),
	]
)

export const flashcardAnswerAttempt = sqliteTable(
	'flashcardAnswerAttempt',
	{
		id: text('id').primaryKey(),
		userID: text('userID').notNull().references(() => user.id, { onDelete: 'cascade' }),
		boardID: text('boardID').notNull().references(() => board.id, { onDelete: 'cascade' }),
		shapeID: text('shapeID').notNull(),
		reviewID: text('reviewID'),
		reviewCountAtAttempt: integer('reviewCountAtAttempt'),
		front: text('front').notNull(),
		primaryAnswer: text('primaryAnswer').notNull(),
		alternateAnswers: text('alternateAnswers', { mode: 'json' }).$type<string[]>().notNull(),
		submittedAnswer: text('submittedAnswer'),
		originalVerdict: text('originalVerdict', {
			enum: ['correct', 'incorrect', 'uncertain', 'skipped'],
		}).notNull(),
		finalVerdict: text('finalVerdict', { enum: ['correct', 'incorrect', 'skipped'] }),
		gradingMethod: text('gradingMethod', {
			enum: ['exact', 'edit-distance', 'word-coverage', 'ai', 'ai-unavailable', 'skipped'],
		}).notNull(),
		matchedAnswer: text('matchedAnswer'),
		feedback: text('feedback'),
		model: text('model'),
		rating: text('rating', { enum: ['again', 'hard', 'good', 'easy'] }),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		completedAt: integer('completedAt', { mode: 'timestamp' }),
	},
	(table) => [
		index('flashcardAnswerAttempt_userID_createdAt_idx').on(table.userID, table.createdAt),
		index('flashcardAnswerAttempt_boardID_shapeID_idx').on(table.boardID, table.shapeID),
	]
)

export const flashcardReviewEvent = sqliteTable(
	'flashcardReviewEvent',
	{
		id: text('id').primaryKey(),
		userID: text('userID').notNull().references(() => user.id, { onDelete: 'cascade' }),
		boardID: text('boardID').notNull().references(() => board.id, { onDelete: 'cascade' }),
		reviewID: text('reviewID').notNull(),
		rating: text('rating', { enum: ['again', 'hard', 'good', 'easy'] }).notNull(),
		intervalDays: integer('intervalDays').notNull(),
		easeFactor: real('easeFactor').notNull(),
		reviewedAt: integer('reviewedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('flashcardReviewEvent_userID_reviewedAt_idx').on(table.userID, table.reviewedAt),
		index('flashcardReviewEvent_boardID_reviewedAt_idx').on(table.boardID, table.reviewedAt),
	]
)

export const agentAction = sqliteTable(
	'agentAction',
	{
		id: text('id').primaryKey(),
		boardID: text('boardID').notNull().references(() => board.id, { onDelete: 'cascade' }),
		userID: text('userID').notNull().references(() => user.id, { onDelete: 'cascade' }),
		conversationID: text('conversationID'),
		toolName: text('toolName').notNull(),
		planID: text('planID'),
		baseDocumentClock: integer('baseDocumentClock'),
		recordIDs: text('recordIDs').notNull(),
		beforeRecords: text('beforeRecords').notNull(),
		afterRecords: text('afterRecords').notNull(),
		status: text('status', { enum: ['accepted', 'undoing', 'undone'] }).notNull().default('accepted'),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		undoStartedAt: integer('undoStartedAt', { mode: 'timestamp' }),
		undoneAt: integer('undoneAt', { mode: 'timestamp' }),
	},
	(table) => [
		index('agentAction_boardID_createdAt_idx').on(table.boardID, table.createdAt),
		index('agentAction_userID_createdAt_idx').on(table.userID, table.createdAt),
	]
)

export const studyMistake = sqliteTable(
	'studyMistake',
	{
		id: text('id').primaryKey(),
		userID: text('userID').notNull().references(() => user.id, { onDelete: 'cascade' }),
		boardID: text('boardID').references(() => board.id, { onDelete: 'cascade' }),
		concept: text('concept').notNull(),
		title: text('title').notNull(),
		description: text('description').notNull(),
		kind: text('kind', {
			enum: ['background', 'goal', 'learning-pattern', 'preference'],
		}).notNull().default('learning-pattern'),
		patternKey: text('patternKey').notNull(),
		shapeIDs: text('shapeIDs').notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('studyMistake_userID_boardID_createdAt_idx').on(
			table.userID,
			table.boardID,
			table.createdAt
		),
		index('studyMistake_userID_patternKey_idx').on(table.userID, table.patternKey),
	]
)

export const studyArtifact = sqliteTable(
	'studyArtifact',
	{
		boardID: text('boardID')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		shapeID: text('shapeID').notNull(),
		kind: text('kind', {
			enum: [
				'concept-map',
				'equation',
				'flashcard',
				'note',
				'practice-problem',
				'quiz',
				'review-note',
				'teach-back',
				'walkthrough',
			],
		}).notNull(),
		title: text('title').notNull(),
		text: text('text').notNull(),
		payload: text('payload').notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.boardID, table.shapeID] }),
		index('studyArtifact_boardID_kind_idx').on(table.boardID, table.kind),
	]
)

export const examPlan = sqliteTable(
	'examPlan',
	{
		id: text('id').primaryKey(),
		userID: text('userID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		examDate: text('examDate').notNull(),
		boardIDs: text('boardIDs', { mode: 'json' }).$type<string[]>().notNull(),
		documentIDs: text('documentIDs', { mode: 'json' }).$type<string[]>().notNull(),
		primaryBoardID: text('primaryBoardID')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		practiceSet: text('practiceSet'),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('examPlan_userID_examDate_idx').on(table.userID, table.examDate),
	]
)

export const agentProfile = sqliteTable('agentProfile', {
	userID: text('userID').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
	personality: text('personality', {
		enum: ['balanced', 'encouraging', 'precise', 'challenging', 'custom'],
	}).notNull().default('balanced'),
	customPersonality: text('customPersonality').notNull().default(''),
	customInstructions: text('customInstructions').notNull().default(''),
	aboutUser: text('aboutUser').notNull().default(''),
	includeMemories: integer('includeMemories', { mode: 'boolean' }).notNull().default(true),
	includeAboutUser: integer('includeAboutUser', { mode: 'boolean' }).notNull().default(true),
	includeCustomInstructions: integer('includeCustomInstructions', { mode: 'boolean' }).notNull().default(true),
	includeBoardContext: integer('includeBoardContext', { mode: 'boolean' }).notNull().default(true),
	includeConnectedServices: integer('includeConnectedServices', { mode: 'boolean' }).notNull().default(true),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const document = sqliteTable(
	'documents',
	{
		id: text('id').primaryKey(),
		boardID: text('boardID')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		ownerID: text('ownerID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		r2Key: text('r2Key').notNull(),
		pageCount: integer('pageCount').notNull(),
		byteSize: integer('byteSize').notNull(),
		status: text('status', { enum: ['processing', 'ready', 'failed'] })
			.notNull()
			.default('processing'),
		failureReason: text('failureReason'),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('documents_boardID_createdAt_idx').on(table.boardID, table.createdAt),
		index('documents_ownerID_createdAt_idx').on(table.ownerID, table.createdAt),
	]
)

export const documentPage = sqliteTable(
	'document_pages',
	{
		documentID: text('documentID')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		pageNumber: integer('pageNumber').notNull(),
		imageR2Key: text('imageR2Key').notNull(),
		extractedText: text('extractedText').notNull().default(''),
		textLayout: text('textLayout').notNull().default('[]'),
		width: real('width').notNull(),
		height: real('height').notNull(),
		ocrApplied: integer('ocrApplied', { mode: 'boolean' }).notNull().default(false),
	},
	(table) => [
		primaryKey({ columns: [table.documentID, table.pageNumber] }),
		index('document_pages_documentID_pageNumber_idx').on(table.documentID, table.pageNumber),
	]
)

export const documentChunk = sqliteTable(
	'document_chunks',
	{
		vectorID: text('vectorID').primaryKey(),
		documentID: text('documentID')
			.notNull()
			.references(() => document.id, { onDelete: 'cascade' }),
		pageNumber: integer('pageNumber').notNull(),
	},
	(table) => [index('document_chunks_documentID_idx').on(table.documentID)]
)

export const lecture = sqliteTable(
	'lectures',
	{
		id: text('id').primaryKey(),
		boardID: text('boardID')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		ownerID: text('ownerID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		r2Key: text('r2Key').notNull(),
		mediaType: text('mediaType').notNull(),
		byteSize: integer('byteSize').notNull(),
		status: text('status', { enum: ['processing', 'ready', 'failed'] })
			.notNull()
			.default('processing'),
		transcript: text('transcript').notNull().default(''),
		segments: text('segments', { mode: 'json' }).$type<LectureSegment[]>().notNull(),
		durationSeconds: real('durationSeconds'),
		failureReason: text('failureReason'),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		index('lectures_boardID_createdAt_idx').on(table.boardID, table.createdAt),
		index('lectures_ownerID_createdAt_idx').on(table.ownerID, table.createdAt),
	]
)

export const lectureChunk = sqliteTable(
	'lecture_chunks',
	{
		vectorID: text('vectorID').primaryKey(),
		lectureID: text('lectureID')
			.notNull()
			.references(() => lecture.id, { onDelete: 'cascade' }),
		startSecond: real('startSecond').notNull(),
		endSecond: real('endSecond').notNull(),
	},
	(table) => [index('lecture_chunks_lectureID_idx').on(table.lectureID)]
)

export const documentProcessingUsage = sqliteTable(
	'document_processing_usage',
	{
		importID: text('importID').primaryKey(),
		ownerID: text('ownerID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		pageCount: integer('pageCount').notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [index('document_processing_usage_ownerID_createdAt_idx').on(table.ownerID, table.createdAt)]
)

export const craftDocumentLink = sqliteTable(
	'craft_document_links',
	{
		id: text('id').primaryKey(),
		boardID: text('boardID')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		connectionOwnerID: text('connectionOwnerID')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		documentID: text('documentID').notNull(),
		title: text('title').notNull(),
		createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	},
	(table) => [
		uniqueIndex('craft_document_links_board_owner_document_unique').on(
			table.boardID,
			table.connectionOwnerID,
			table.documentID
		),
		index('craft_document_links_board_created_idx').on(table.boardID, table.createdAt),
	]
)

export const userRelations = relations(user, ({ many, one }) => ({
	sessions: many(session),
	accounts: many(account),
	ownedBoards: many(board),
	boardMemberships: many(boardMember),
	studyConversations: many(studyConversation),
	flashcardReviews: many(flashcardReview),
	flashcardAnswerAttempts: many(flashcardAnswerAttempt),
	studyMistakes: many(studyMistake),
	studyArtifacts: many(studyArtifact),
	examPlans: many(examPlan),
	agentProfile: one(agentProfile),
	documents: many(document),
	lectures: many(lecture),
	documentProcessingUsage: many(documentProcessingUsage),
	craftDocumentLinks: many(craftDocumentLink),
	courses: many(course),
	boardInvitations: many(boardInvitation),
}))

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const boardRelations = relations(board, ({ one, many }) => ({
	owner: one(user, { fields: [board.ownerID], references: [user.id] }),
	course: one(course, { fields: [board.courseID], references: [course.id] }),
	members: many(boardMember),
	invitations: many(boardInvitation),
	studyConversations: many(studyConversation),
	flashcardReviews: many(flashcardReview),
	flashcardAnswerAttempts: many(flashcardAnswerAttempt),
	studyMistakes: many(studyMistake),
	studyArtifacts: many(studyArtifact),
	primaryExamPlans: many(examPlan),
	documents: many(document),
	lectures: many(lecture),
	craftDocumentLinks: many(craftDocumentLink),
}))

export const boardMemberRelations = relations(boardMember, ({ one }) => ({
	board: one(board, { fields: [boardMember.boardID], references: [board.id] }),
	user: one(user, { fields: [boardMember.userID], references: [user.id] }),
}))

export const courseRelations = relations(course, ({ many, one }) => ({
	owner: one(user, { fields: [course.ownerID], references: [user.id] }),
	boards: many(board),
}))

export const boardInvitationRelations = relations(boardInvitation, ({ one }) => ({
	board: one(board, { fields: [boardInvitation.boardID], references: [board.id] }),
	inviter: one(user, { fields: [boardInvitation.inviterID], references: [user.id] }),
}))

export const studyConversationRelations = relations(studyConversation, ({ one }) => ({
	board: one(board, { fields: [studyConversation.boardID], references: [board.id] }),
	user: one(user, { fields: [studyConversation.userID], references: [user.id] }),
}))

export const flashcardReviewRelations = relations(flashcardReview, ({ one }) => ({
	board: one(board, { fields: [flashcardReview.boardID], references: [board.id] }),
	user: one(user, { fields: [flashcardReview.userID], references: [user.id] }),
}))

export const flashcardAnswerAttemptRelations = relations(flashcardAnswerAttempt, ({ one }) => ({
	board: one(board, { fields: [flashcardAnswerAttempt.boardID], references: [board.id] }),
	user: one(user, { fields: [flashcardAnswerAttempt.userID], references: [user.id] }),
}))

export const studyMistakeRelations = relations(studyMistake, ({ one }) => ({
	board: one(board, { fields: [studyMistake.boardID], references: [board.id] }),
	user: one(user, { fields: [studyMistake.userID], references: [user.id] }),
}))

export const studyArtifactRelations = relations(studyArtifact, ({ one }) => ({
	board: one(board, { fields: [studyArtifact.boardID], references: [board.id] }),
}))

export const examPlanRelations = relations(examPlan, ({ one }) => ({
	user: one(user, { fields: [examPlan.userID], references: [user.id] }),
	primaryBoard: one(board, { fields: [examPlan.primaryBoardID], references: [board.id] }),
}))

export const agentProfileRelations = relations(agentProfile, ({ one }) => ({
	user: one(user, { fields: [agentProfile.userID], references: [user.id] }),
}))

export const documentRelations = relations(document, ({ one, many }) => ({
	board: one(board, { fields: [document.boardID], references: [board.id] }),
	owner: one(user, { fields: [document.ownerID], references: [user.id] }),
	pages: many(documentPage),
	chunks: many(documentChunk),
}))

export const documentPageRelations = relations(documentPage, ({ one }) => ({
	document: one(document, { fields: [documentPage.documentID], references: [document.id] }),
}))

export const documentChunkRelations = relations(documentChunk, ({ one }) => ({
	document: one(document, { fields: [documentChunk.documentID], references: [document.id] }),
}))

export const lectureRelations = relations(lecture, ({ one, many }) => ({
	board: one(board, { fields: [lecture.boardID], references: [board.id] }),
	owner: one(user, { fields: [lecture.ownerID], references: [user.id] }),
	chunks: many(lectureChunk),
}))

export const lectureChunkRelations = relations(lectureChunk, ({ one }) => ({
	lecture: one(lecture, { fields: [lectureChunk.lectureID], references: [lecture.id] }),
}))

export const documentProcessingUsageRelations = relations(documentProcessingUsage, ({ one }) => ({
	owner: one(user, { fields: [documentProcessingUsage.ownerID], references: [user.id] }),
}))

export const craftDocumentLinkRelations = relations(craftDocumentLink, ({ one }) => ({
	board: one(board, { fields: [craftDocumentLink.boardID], references: [board.id] }),
	connectionOwner: one(user, {
		fields: [craftDocumentLink.connectionOwnerID],
		references: [user.id],
	}),
}))
