import { readProperty } from '@agentboard/shared'
import { hasObjectType } from '@agentboard/shared'
import {
	FLASHCARD_SHAPE_TYPE,
	STUDY_MODELS,
	STUDY_REASONING_EFFORTS,
	apiRoutes,
	getStudyModel,
	getStudyContextLectureSources,
	parseCraftDocumentCitationHref,
	studyReasoningEffortSchema,
	type ConceptMapProposal,
	type AgentMemoryProposal,
	type CanvasPlanInput,
	type CanvasContext,
	type EquationProposal,
	type FlashcardProposal,
	type MistakeProposal,
	type PracticeSetProposal,
	type QuizProposal,
	type ReviewProposal,
	type SpotifyAgentPlayInput,
	type SpotifyAgentPlayOutput,
	type StudyConversation,
	type StudyContextReceipt,
	type AgentActionSummary,
	type StudyMessageContextChip,
	type StudyMessageMetadata,
	type StudyModelMode,
	type StudyMode,
	type StudyReasoningEffort,
	type StudyPackProposal,
	type WalkthroughProposal,
} from '@agentboard/shared'
import { useChat, type UseChatHelpers } from '@ai-sdk/react'
import { MessageScroller } from '@shadcn/react/message-scroller'
import {
	IconArrowDown,
	IconArrowBackUp,
	IconArrowUp,
	IconBolt,
	IconBrain,
	IconBrandCraft,
	IconCards,
	IconCheck,
	IconChevronDown,
	IconCircleCheck,
	IconCopy,
	IconFileText,
	IconFocus2,
	IconHistory,
	IconHeadphones,
	IconInfoCircle,
	IconLock,
	IconPaperclip,
	IconPhoto,
	IconPlayerStop,
	IconPlus,
	IconRefresh,
	IconSparkles,
	IconX,
	IconVersions,
} from '@tabler/icons-react'
import {
	convertFileListToFileUIParts,
	DefaultChatTransport,
	getToolName,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
	type FileUIPart,
	type UIMessage,
} from 'ai'
import type { ChangeEvent, ClipboardEvent, ComponentPropsWithoutRef, CSSProperties, FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Streamdown, type Components } from 'streamdown'
import { Editor } from 'tldraw'
import { ThinkingStatus } from '../../../components/ThinkingStatus'
import { apiRequest } from '../../../lib/api'
import { ReasoningTrail } from './ReasoningTrail'
import {
	captureCanvasRecords,
	createAgentAction,
	listAgentActions,
	persistAgentAction,
	rollbackUnpersistedAgentAction,
	undoAgentAction,
} from '../lib/agentActionLedger'
import {
	readStudyMode,
	readStudyModelMode,
	readStudyReasoningEffort,
	writeStudyMode,
	writeStudyModelMode,
	writeStudyReasoningEffort,
} from '../lib/studyPreferences'
import { captureCanvasContext } from '../lib/canvasContextCapture'
import { resolveCanvasContextForRequest } from '../lib/canvasContextRequest'
import { focusPDFCitation, parsePDFCitationHref } from '../lib/pdfCitation'
import {
	focusLectureCitation,
	parseLectureCitationHref,
} from '../lib/lectureCitation'
import {
	capturePDFTextSelection,
	clearPDFTextSelection,
} from '../lib/pdfTextSelection'
import { studyMarkdownPlugins } from '../lib/studyMath'
import { getMessageCopyText } from '../lib/studyMessageActions'
import { subscribeToZenChatPrompt } from '../lib/zenChatPrompt'
import {
	hasProviderToolCallEnvelope,
	parseLeakedProposal,
	type LeakedProposal,
} from '../lib/studyProposal'
import {
	applyProposal,
	isStudyToolName,
	persistProposalEffect,
	recordProposedMistake,
	saveProposedMemory,
	type StudyToolName,
} from '../lib/studyProposalApply'
import {
	getProposalPreview,
	proposalShortLabel,
} from '../lib/studyProposalSummary'
import type { FlashcardShape } from '../shapes/studyShapeUtils'
import { LockInPanel } from '../../lock-in/LockInPanel'
import { useLockIn } from '../../lock-in/LockInProvider'
import { openCraftDocumentPreview } from '../../craft/craftPreviewEvent'
import './studyChat.css'

interface StudyPanelProps {
	boardID: string
	editor: Editor | null
}

const MAX_ATTACHMENT_BYTES = 4 * 1_024 * 1_024
const ALLOWED_IMAGE_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])

export function StudyPanel({ boardID, editor }: StudyPanelProps) {
	const [conversations, setConversations] = useState<StudyConversation[] | null>(null)
	const [currentConversationID, setCurrentConversationID] = useState<string | null>(null)
	const [historyOpen, setHistoryOpen] = useState(false)
	const [actionLedgerOpen, setActionLedgerOpen] = useState(false)
	const [agentActions, setAgentActions] = useState<AgentActionSummary[] | null>(null)
	const [agentActionError, setAgentActionError] = useState<string | null>(null)
	const [undoingActionID, setUndoingActionID] = useState<string | null>(null)
	const [actionLedgerVersion, setActionLedgerVersion] = useState(0)
	const [conversationError, setConversationError] = useState<string | null>(null)
	const [isCreatingConversation, setIsCreatingConversation] = useState(false)
	const [selectionCount, setSelectionCount] = useState(0)
	const [hasPDFTextSelection, setHasPDFTextSelection] = useState(false)
	const [showLockInPanel, setShowLockInPanel] = useState(true)
	const { session: lockInSession } = useLockIn()
	const currentConversation = conversations?.find(({ id }) => id === currentConversationID) ?? null

	useEffect(() => {
		if (!actionLedgerOpen) return
		void loadAgentActionLedger()
	}, [actionLedgerOpen, actionLedgerVersion, boardID])

	useEffect(() => {
		if (lockInSession) setShowLockInPanel(true)
	}, [lockInSession?.id])

	useEffect(() => {
		let cancelled = false
		void apiRequest<{ conversations: StudyConversation[] }>(apiRoutes.studyConversations(boardID))
			.then((response) => {
				if (cancelled) return
				setConversations(response.conversations)
				setCurrentConversationID((current) =>
					response.conversations.some(({ id }) => id === current)
						? current
						: response.conversations[0]?.id ?? null
				)
			})
			.catch((error) => {
				if (!cancelled) setConversationError(getErrorMessage(error))
			})
		return () => {
			cancelled = true
		}
	}, [boardID])

	useEffect(() => {
		if (!editor) return
		const updateSelectionCount = () => setSelectionCount(editor.getSelectedShapes().length)
		updateSelectionCount()
		editor.on('change', updateSelectionCount)
		return () => {
			editor.off('change', updateSelectionCount)
		}
	}, [editor])

	useEffect(() => {
		const updatePDFTextSelection = () => {
			setHasPDFTextSelection(Boolean(capturePDFTextSelection()))
		}
		const clearPDFContextFromCanvas = (event: PointerEvent) => {
			const target = event.target
			if (!(target instanceof Element)) return
			if (
				target.closest('.StudyPanel') ||
				target.closest('[data-pdf-text-layer="true"]')
			) return
			clearPDFTextSelection()
			setHasPDFTextSelection(false)
		}
		updatePDFTextSelection()
		document.addEventListener('selectionchange', updatePDFTextSelection)
		document.addEventListener('pointerdown', clearPDFContextFromCanvas, true)
		return () => {
			document.removeEventListener('selectionchange', updatePDFTextSelection)
			document.removeEventListener('pointerdown', clearPDFContextFromCanvas, true)
			clearPDFTextSelection()
		}
	}, [boardID])

	useEffect(() => {
		if (!editor) return
		let timeoutID: number | undefined
		let lastSignature = ''
		const syncFlashcards = () => {
			const cards = editor.getCurrentPageShapesSorted().flatMap((shape) => {
				if (shape.type !== FLASHCARD_SHAPE_TYPE) return []
				const flashcard = shape as FlashcardShape
				return [{
					shapeID: flashcard.id,
					front: flashcard.props.front,
					back: flashcard.props.back,
					alternateAnswers: flashcard.props.alternateAnswers,
				}]
			})
			const signature = JSON.stringify(cards)
			if (!cards.length || signature === lastSignature) return
			lastSignature = signature
			void apiRequest(apiRoutes.boardFlashcards(boardID), {
				body: JSON.stringify({ cards }),
				method: 'POST',
			}).catch(() => undefined)
		}
		const scheduleSync = () => {
			if (timeoutID !== undefined) window.clearTimeout(timeoutID)
			timeoutID = window.setTimeout(syncFlashcards, 500)
		}
		scheduleSync()
		editor.on('change', scheduleSync)
		return () => {
			editor.off('change', scheduleSync)
			if (timeoutID !== undefined) window.clearTimeout(timeoutID)
		}
	}, [boardID, editor])

	async function createConversation() {
		if (isCreatingConversation) return
		setIsCreatingConversation(true)
		setConversationError(null)
		try {
			const response = await apiRequest<{ conversation: StudyConversation }>(
				apiRoutes.studyConversations(boardID),
				{ method: 'POST' }
			)
			setConversations((current) => [response.conversation, ...(current ?? [])])
			setCurrentConversationID(response.conversation.id)
			setHistoryOpen(false)
		} catch (error) {
			setConversationError(getErrorMessage(error))
		} finally {
			setIsCreatingConversation(false)
		}
	}

	async function loadAgentActionLedger() {
		try {
			const response = await listAgentActions(boardID)
			setAgentActions(response.actions)
			setAgentActionError(null)
		} catch (error) {
			setAgentActionError(getErrorMessage(error))
		}
	}

	async function undoAcceptedAction(action: AgentActionSummary) {
		if (!editor || undoingActionID) return
		setUndoingActionID(action.id)
		setAgentActionError(null)
		try {
			await undoAgentAction(editor, boardID, action.id)
			await loadAgentActionLedger()
		} catch (error) {
			setAgentActionError(getErrorMessage(error))
		} finally {
			setUndoingActionID(null)
		}
	}

	function updateConversation(message: string) {
		if (!currentConversation) return
		const conversationID = currentConversation.id
		const shouldSetTitle = currentConversation.title === 'New conversation'
		/** Show a trimmed excerpt immediately; Llama 4 replaces it with a topic label moments later. */
		const optimisticTitle = shouldSetTitle ? createConversationTitle(message) : currentConversation.title
		const optimistic = { ...currentConversation, title: optimisticTitle, updatedAt: new Date().toISOString() }
		setConversations((current) => [optimistic, ...(current ?? []).filter(({ id }) => id !== optimistic.id)])

		const request = shouldSetTitle
			? apiRequest<{ conversation: StudyConversation }>(
				apiRoutes.studyConversationTitle(boardID, conversationID),
				{ body: JSON.stringify({ message }), method: 'POST' }
			)
			: apiRequest<{ conversation: StudyConversation }>(
				apiRoutes.studyConversation(boardID, conversationID),
				{ body: JSON.stringify({}), method: 'PATCH' }
			)

		void request.then((response) => {
			setConversations((current) => [
				response.conversation,
				...(current ?? []).filter(({ id }) => id !== response.conversation.id),
			])
		}).catch(() => undefined)
	}

	return (
		<div className="StudyPanel">
			<header className="StudyPanel-header" data-lock-in={Boolean(lockInSession && showLockInPanel)}>
				<span className="StudyPanel-mark">
					{lockInSession && showLockInPanel
						? <IconLock aria-hidden="true" size={15} stroke={1.9} />
						: <IconSparkles aria-hidden="true" size={15} stroke={1.9} />}
				</span>
				<div className="StudyPanel-headtext">
					{lockInSession && showLockInPanel ? (
						<>
							<h2>Lock In</h2>
							<span className="StudyPanel-conversation" title={lockInSession.goal}>{lockInSession.goal}</span>
						</>
					) : (
						<h2 title={currentConversation?.title}>{currentConversation?.title ?? 'New conversation'}</h2>
					)}
				</div>
				<div className="StudyPanel-actions">
					{lockInSession && !showLockInPanel ? (
						<button aria-label="Return to Lock In coach" onClick={() => setShowLockInPanel(true)} title="Return to Lock In coach" type="button"><IconLock aria-hidden="true" size={16} /></button>
					) : null}
					{!lockInSession || !showLockInPanel ? (
						<>
							<button aria-label="New conversation" disabled={isCreatingConversation} onClick={() => void createConversation()} title="New conversation" type="button"><IconPlus aria-hidden="true" size={16} /></button>
							<button aria-controls="study-action-ledger" aria-expanded={actionLedgerOpen} aria-label="AI change history" onClick={() => { setActionLedgerOpen((open) => !open); setHistoryOpen(false) }} title="AI change history" type="button"><IconVersions aria-hidden="true" size={16} /></button>
							<button aria-controls="study-history" aria-expanded={historyOpen} aria-label="Conversation history" onClick={() => { setHistoryOpen((open) => !open); setActionLedgerOpen(false) }} title="Conversation history" type="button"><IconHistory aria-hidden="true" size={16} /></button>
						</>
					) : null}
				</div>
			</header>
			<div className="StudyPanel-main">
				{lockInSession && showLockInPanel ? (
					<LockInPanel onOpenStudyChat={() => setShowLockInPanel(false)} />
				) : (
					<>
				{historyOpen ? (
					<nav aria-label="Conversation history" className="StudyHistory" id="study-history">
						<div><strong>Recent conversations</strong><button onClick={() => void createConversation()} type="button"><IconPlus aria-hidden="true" size={14} /> New</button></div>
						{conversations?.map((conversation) => (
							<button className={conversation.id === currentConversationID ? 'is-current' : undefined} key={conversation.id} onClick={() => { setCurrentConversationID(conversation.id); setHistoryOpen(false) }} type="button">
								<span>{conversation.title}</span><time dateTime={conversation.updatedAt}>{formatConversationDate(conversation.updatedAt)}</time>
							</button>
						))}
					</nav>
				) : null}
				{actionLedgerOpen ? (
					<section aria-label="AI change history" className="AgentActionLedger" id="study-action-ledger">
						<div><strong>AI changes</strong><span>Safe undo checks current records</span></div>
						{agentActionError ? <p role="alert">{agentActionError}</p> : null}
						{agentActions === null && !agentActionError ? <p role="status">Loading changes…</p> : null}
						{agentActions?.length === 0 ? <p>No accepted canvas changes yet.</p> : null}
						{agentActions?.map((action) => (
							<article key={action.id}>
								<div>
									<strong>{formatAgentActionName(action.toolName)}</strong>
									<small>{action.recordIDs.length} {action.recordIDs.length === 1 ? 'record' : 'records'} · {formatConversationDate(action.createdAt)}</small>
								</div>
								{action.status === 'accepted' ? (
									<button disabled={!editor || Boolean(undoingActionID)} onClick={() => void undoAcceptedAction(action)} type="button">
										<IconArrowBackUp aria-hidden="true" size={14} />
										{undoingActionID === action.id ? 'Undoing…' : 'Undo'}
									</button>
								) : <span>{action.status === 'undone' ? 'Undone' : 'Undo in progress'}</span>}
							</article>
						))}
					</section>
				) : null}
				{conversationError ? <p className="StudyPanel-error" role="alert">{conversationError}</p> : null}
				{currentConversation ? (
					<StudyConversationSession
						boardID={boardID}
						conversation={currentConversation}
						editor={editor}
						key={currentConversation.agentName}
						onActivity={updateConversation}
						onAgentAction={() => setActionLedgerVersion((version) => version + 1)}
						hasPDFTextSelection={hasPDFTextSelection}
						selectionCount={selectionCount}
					/>
				) : conversations ? (
					<div className="StudyPanel-loading"><p>No conversations yet.</p><button onClick={() => void createConversation()} type="button">Start one</button></div>
				) : (
					<div className="StudyPanel-loading"><ThinkingStatus>Loading conversations…</ThinkingStatus></div>
				)}
					</>
				)}
			</div>
		</div>
	)
}

interface StudyConversationSessionProps {
	boardID: string
	conversation: StudyConversation
	editor: Editor | null
	hasPDFTextSelection: boolean
	onActivity: (message: string) => void
	onAgentAction: () => void
	selectionCount: number
}

function StudyConversationSession({
	boardID,
	conversation,
	editor,
	hasPDFTextSelection,
	onActivity,
	onAgentAction,
	selectionCount,
}: StudyConversationSessionProps) {
	const [initialMessages, setInitialMessages] = useState<StudyUIMessage[] | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		void apiRequest<{ messages: StudyUIMessage[] }>(
			apiRoutes.studyConversationMessages(boardID, conversation.id)
		).then(({ messages }) => {
			if (!cancelled) setInitialMessages(messages)
		}).catch((error) => {
			if (!cancelled) setLoadError(getErrorMessage(error))
		})
		return () => {
			cancelled = true
		}
	}, [boardID, conversation.id])

	if (loadError) return <p className="StudyPanel-error" role="alert">{loadError}</p>
	if (!initialMessages) {
		return <div className="StudyPanel-loading"><ThinkingStatus state="searching">Opening conversation…</ThinkingStatus></div>
	}

	return (
		<StudyConversationChat
			boardID={boardID}
			conversation={conversation}
			editor={editor}
			hasPDFTextSelection={hasPDFTextSelection}
			initialMessages={initialMessages}
			onActivity={onActivity}
			onAgentAction={onAgentAction}
			selectionCount={selectionCount}
		/>
	)
}

type StudyTools = {
	addReviewNote: { input: ReviewProposal; output: { applied: boolean } }
	createFlashcards: { input: FlashcardProposal; output: { applied: boolean } }
	createQuiz: { input: QuizProposal; output: { applied: boolean } }
	createWalkthrough: { input: WalkthroughProposal; output: { applied: boolean } }
	createConceptMap: { input: ConceptMapProposal; output: { applied: boolean } }
	createPracticeSet: { input: PracticeSetProposal; output: { applied: boolean } }
	createStudyPack: { input: StudyPackProposal; output: { applied: boolean } }
	composeCanvas: { input: CanvasPlanInput; output: { applied: boolean } }
	writeEquation: { input: EquationProposal; output: { applied: boolean } }
	recordMistake: { input: MistakeProposal; output: { applied: boolean } }
	saveMemory: { input: AgentMemoryProposal; output: { applied: boolean } }
	playSpotify: { input: SpotifyAgentPlayInput; output: SpotifyAgentPlayOutput }
	search: { input: unknown; output: unknown }
	answer: { input: unknown; output: unknown }
	crawl: { input: unknown; output: unknown }
}

type StudyUIMessage = UIMessage<StudyMessageMetadata, Record<string, never>, StudyTools>
type AddStudyToolOutput = UseChatHelpers<StudyUIMessage>['addToolOutput']

interface StudyConversationChatProps extends StudyConversationSessionProps {
	initialMessages: StudyUIMessage[]
}

function StudyConversationChat({
	boardID,
	conversation,
	editor,
	hasPDFTextSelection,
	initialMessages,
	onActivity,
	onAgentAction,
	selectionCount,
}: StudyConversationChatProps) {
	const [input, setInput] = useState('')
	const [attachments, setAttachments] = useState<FileUIPart[]>([])
	const [attachmentError, setAttachmentError] = useState<string | null>(null)
	const [copiedMessageID, setCopiedMessageID] = useState<string | null>(null)
	const [modelMode, setModelMode] = useState<StudyModelMode>(readStudyModelMode)
	const [reasoningEffort, setReasoningEffort] = useState<StudyReasoningEffort>(readStudyReasoningEffort)
	const [studyMode, setStudyMode] = useState<StudyMode>(readStudyMode)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const canvasContextRef = useRef<CanvasContext | null>(null)
	const transport = useMemo(() => new DefaultChatTransport<StudyUIMessage>({
		api: apiRoutes.studyConversationMessages(boardID, conversation.id),
		prepareSendMessagesRequest: async ({ id, messageId, messages, trigger }) => {
			const canvasContext = await resolveCanvasContextForRequest({
				capture: () => captureCanvasContext(boardID, editor),
				messages,
				previous: canvasContextRef.current,
			})
			canvasContextRef.current = canvasContext
			return {
				body: {
					canvasContext,
					id,
					messageId,
					messages,
					modelMode,
					reasoningEffort,
					studyMode,
					trigger,
				},
			}
		},
	}), [boardID, conversation.id, editor, modelMode, reasoningEffort, studyMode])
	const chat = useChat<StudyUIMessage>({
		id: conversation.id,
		messages: initialMessages,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		transport,
	})

	useEffect(() => subscribeToZenChatPrompt(setInput), [])

	useEffect(() => () => {
		if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
	}, [])

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const text = input.trim()
		if ((!text && attachments.length === 0) || chat.status !== 'ready') return
		/** Freeze what was attached so it can ride along as chips on the sent message. */
		const contextChips = buildContextChips(selectionCount, hasPDFTextSelection)
		setInput('')
		setAttachments([])
		setAttachmentError(null)
		if (fileInputRef.current) fileInputRef.current.value = ''
		onActivity(text || 'Image question')
		void chat.sendMessage({
			files: attachments,
			text,
			...(contextChips.length ? { metadata: { contextChips } } : {}),
		})
	}

	async function attachImages(files: FileList) {
		setAttachmentError(null)
		const candidates = Array.from(files)
		if (attachments.length + candidates.length > 3) {
			setAttachmentError('Attach up to three images at a time.')
			return
		}
		if (candidates.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type))) {
			setAttachmentError('Use PNG, JPEG, WebP, or GIF images.')
			return
		}
		const totalBytes = candidates.reduce((total, file) => total + file.size, 0) + estimateAttachmentBytes(attachments)
		if (totalBytes > MAX_ATTACHMENT_BYTES) {
			setAttachmentError('Keep image attachments under 4 MB total.')
			return
		}
		try {
			const parts = await convertFileListToFileUIParts(files)
			setAttachments((current) => [...current, ...parts])
		} catch {
			setAttachmentError('Those images could not be attached.')
		}
	}

	async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
		const files = event.target.files
		if (!files?.length) return
		try {
			await attachImages(files)
		} finally {
			event.target.value = ''
		}
	}

	function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
		const files = event.clipboardData.files
		if (files.length === 0) return
		if (chat.status !== 'ready') return
		/** The clipboard also carries a screenshot's placeholder text; only the image is useful. */
		event.preventDefault()
		void attachImages(files)
	}

	function chooseModel(mode: StudyModelMode) {
		setModelMode(mode)
		writeStudyModelMode(mode)
	}

	function chooseReasoningEffort(effort: StudyReasoningEffort) {
		setReasoningEffort(effort)
		writeStudyReasoningEffort(effort)
	}

	async function copyMessage(messageID: string, text: string) {
		try {
			await navigator.clipboard.writeText(text)
			setCopiedMessageID(messageID)
			if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
			copyResetTimerRef.current = setTimeout(() => {
				setCopiedMessageID(null)
				copyResetTimerRef.current = null
			}, 1_500)
		} catch (error) {
			console.error('Failed to copy chat message', error)
		}
	}

	function toggleStudyMode() {
		const nextMode = studyMode === 'socratic' ? 'direct' : 'socratic'
		setStudyMode(nextMode)
		writeStudyMode(nextMode)
	}

	async function resolveProposal(
		toolName: StudyToolName,
		toolCallID: string,
		proposal: unknown,
		applied: boolean
	) {
		try {
			if (applied) {
				if (toolName === 'saveMemory') {
					await saveProposedMemory(boardID, proposal)
				} else if (toolName === 'recordMistake') {
					await recordProposedMistake(boardID, proposal)
				} else {
					if (!editor) throw new Error('The canvas is not ready')
					const beforeRecords = captureCanvasRecords(editor)
					const effect = applyProposal(editor, toolName, proposal, {
						documentClock: canvasContextRef.current?.documentClock,
					})
					const action = createAgentAction(
						beforeRecords,
						captureCanvasRecords(editor),
						{
							baseDocumentClock: canvasContextRef.current?.documentClock,
							conversationID: conversation.id,
							planID: effect.planID,
							toolName,
						}
					)
					if (action) {
						try {
							await persistAgentAction(boardID, action)
							onAgentAction()
						} catch (ledgerError) {
							rollbackUnpersistedAgentAction(editor, action)
							throw ledgerError
						}
					}
					await persistProposalEffect(boardID, effect)
				}
			}
			await addProposalOutput(chat.addToolOutput, toolName, toolCallID, { applied })
		} catch (error) {
			await addProposalError(chat.addToolOutput, toolName, toolCallID, getErrorMessage(error))
		}
	}

	return (
		<div className="StudyPanel-session">
			<MessageScroller.Provider
				autoScroll
				defaultScrollPosition="last-anchor"
				scrollEdgeThreshold={16}
				scrollMargin={14}
				scrollPreviousItemPeek={48}
			>
				<MessageScroller.Root className="StudyMessageScroller">
					<MessageScroller.Viewport className="StudyPanel-messages">
						<MessageScroller.Content aria-busy={chat.status !== 'ready'} className="StudyPanel-messageContent">
							{chat.messages.length === 0 ? (
								<MessageScroller.Item className="StudyWelcome" messageId="study-welcome">
									<h3>Ask about anything in this space.</h3>
									<p>Select a note or sketch first and I’ll use it as context. I can check reasoning, explain a concept, or propose flashcards and quizzes.</p>
									<div className="StudyPrompts">
										<button onClick={() => setInput('Check my selected work and tell me what I misunderstood.')} type="button"><IconCircleCheck aria-hidden="true" size={17} /> Check my reasoning</button>
										<button onClick={() => setInput('Turn the selected material into flashcards.')} type="button"><IconCards aria-hidden="true" size={17} /> Make flashcards</button>
										<button onClick={() => setInput('Make me three more practice problems like the selected example.')} type="button"><IconBrain aria-hidden="true" size={17} /> Practice this</button>
										<button onClick={() => setInput('Summarize the selected unit as a concept map.')} type="button"><IconSparkles aria-hidden="true" size={17} /> Concept map</button>
									</div>
								</MessageScroller.Item>
							) : null}

							{chat.messages.map((message) => {
								const copyText = getMessageCopyText(message.parts)
								const hasReadableReasoning = message.parts.some(
									(part) => part.type === 'reasoning' && part.text.trim().length > 0
								)
								return (
									<MessageScroller.Item
										className={`ChatMessage ChatMessage--${message.role}`}
										key={message.id}
										messageId={message.id}
										scrollAnchor={message.role === 'user'}
									>
										{message.role === 'assistant' ? (
											<div className="ChatMessage-head">
												<span className="ChatMessage-orb" aria-hidden="true" />
												<strong>Study partner</strong>
											</div>
										) : (
											<span className="sr-only">You</span>
										)}
										{message.role === 'user' ? <MessageContextChips metadata={message.metadata} parts={message.parts} /> : null}
										{message.parts.map((part, index) => {
											if (part.type === 'reasoning') {
												if (message.role !== 'assistant') return null
												const isStreamingPart = part.state === 'streaming'
													&& chat.status === 'streaming'
													&& message.id === chat.messages.at(-1)?.id
												return <ReasoningTrail isStreaming={isStreamingPart} key={index} text={part.text} />
											}
											if (part.type === 'text') {
												if (message.role === 'user') return <p key={index}>{part.text}</p>
												const isAnimating = chat.status === 'streaming'
													&& message.id === chat.messages.at(-1)?.id
												const leakedProposal = isAnimating
													? null
													: parseLeakedProposal(part.text)
												const hasToolEnvelope = hasProviderToolCallEnvelope(part.text)
												if (hasToolEnvelope && isAnimating) return null
												if (leakedProposal) {
													return (
														<LeakedProposalCall
															boardID={boardID}
															conversationID={conversation.id}
															documentClock={canvasContextRef.current?.documentClock}
															editor={editor}
															key={index}
															onAgentAction={onAgentAction}
															proposal={leakedProposal}
														/>
													)
												}
												if (hasToolEnvelope) {
													return <p className="ToolCallFormatError" key={index}>The canvas proposal used an invalid format. Retry this response.</p>
												}
												return <AssistantMarkdown boardID={boardID} editor={editor} isAnimating={isAnimating} key={index}>{part.text}</AssistantMarkdown>
											}
											/** Attached images ride above the bubble as chips (see MessageContextChips). */
											if (part.type === 'file' && part.mediaType.startsWith('image/')) return null
											if (!isToolUIPart(part)) return null
											const toolName = getToolName(part)
											if (!isStudyToolName(toolName)) return null
											const isApplied = part.state === 'output-available' && isAppliedOutput(part.output)
											return (
												<ProposalToolCall
													acceptDisabled={!editor && !isMemoryTool(toolName)}
													input={part.input}
													key={part.toolCallId}
													onAccept={() => resolveProposal(toolName, part.toolCallId, part.input, true)}
													onReject={() => resolveProposal(toolName, part.toolCallId, part.input, false)}
													status={proposalCallStatus(part.state, isApplied)}
													toolName={toolName}
												/>
											)
										})}
										{message.role === 'assistant' && message.metadata?.contextReceipt ? (
											<ResponseContextReceipt receipt={message.metadata.contextReceipt} />
										) : null}
										{message.role === 'assistant'
											&& !hasReadableReasoning
											&& message.metadata?.reasoningEffort ? (
												<ReasoningTrail
													isStreaming={false}
													text={`The model used ${message.metadata.reasoningEffort} private reasoning. Its provider returned the trace encrypted, so its text is not available.`}
												/>
											) : null}
										{message.role === 'assistant' ? (
											<div aria-label="Message actions" className="ChatMessage-actions" role="group">
												<button
													aria-label={copiedMessageID === message.id ? 'Copied' : 'Copy response'}
													disabled={!copyText}
													onClick={() => void copyMessage(message.id, copyText)}
													title={copiedMessageID === message.id ? 'Copied' : 'Copy response'}
													type="button"
												>
													{copiedMessageID === message.id
														? <IconCheck aria-hidden="true" size={15} stroke={2.2} />
														: <IconCopy aria-hidden="true" size={15} stroke={1.8} />}
												</button>
												<button
													aria-label="Retry response"
													disabled={chat.status !== 'ready'}
													onClick={() => void chat.regenerate({ messageId: message.id })}
													title="Retry response"
													type="button"
												>
													<IconRefresh aria-hidden="true" size={15} stroke={1.8} />
												</button>
											</div>
										) : null}
									</MessageScroller.Item>
								)
							})}
							{chat.status === 'submitted' || chat.status === 'streaming' ? (
								<MessageScroller.Item messageId="study-response-status">
									<ThinkingStatus
										className="StudyThinking"
										state={chat.status === 'submitted' ? 'searching' : 'composing'}
									>
										{chat.status === 'submitted' ? 'Reading your selection…' : 'Composing response…'}
									</ThinkingStatus>
								</MessageScroller.Item>
							) : null}
							{chat.error ? (
								<div className="StudyChatError" role="alert">
									<span>{chat.error.message}</span>
									<button onClick={() => void chat.regenerate()} type="button"><IconRefresh aria-hidden="true" size={13} /> Try again</button>
								</div>
							) : null}
						</MessageScroller.Content>
					</MessageScroller.Viewport>
					<MessageScroller.Button className="StudyMessageScroller-jump" direction="end">
						<IconArrowDown aria-hidden="true" size={14} />
						Latest
					</MessageScroller.Button>
				</MessageScroller.Root>
			</MessageScroller.Provider>

			<form className="StudyComposer" onSubmit={handleSubmit}>
				{selectionCount > 0 || hasPDFTextSelection ? (
					<div className="StudyContextChips" role="status">
						{selectionCount > 0 ? (
							<div className="StudyContextChip">
								<IconFocus2 aria-hidden="true" size={13} stroke={1.8} />
								{selectionCount === 1 ? '1 shape selected as context' : `${selectionCount} shapes selected as context`}
							</div>
						) : null}
						{hasPDFTextSelection ? (
							<div className="StudyContextChip">
								<IconFileText aria-hidden="true" size={13} stroke={1.8} />
								PDF text selected as context
							</div>
						) : null}
					</div>
				) : null}
				{attachments.length ? (
					<div className="StudyAttachments" aria-label="Attached images">
						{attachments.map((attachment, index) => (
							<div key={`${attachment.filename ?? 'image'}-${index}`}>
								<img alt="" src={attachment.url} />
								<span>{attachment.filename ?? `Image ${index + 1}`}</span>
								<button aria-label={`Remove ${attachment.filename ?? `image ${index + 1}`}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><IconX aria-hidden="true" size={12} /></button>
							</div>
						))}
					</div>
				) : null}
				{attachmentError ? <p className="StudyAttachmentError" role="alert">{attachmentError}</p> : null}
				<textarea aria-label="Ask your study partner" autoComplete="off" name="study-message" onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
					if (event.key === 'Enter' && !event.shiftKey) {
						event.preventDefault()
						event.currentTarget.form?.requestSubmit()
					}
				}} onPaste={handlePaste} placeholder="Ask about your space…" rows={3} value={input} />
				<input accept="image/gif,image/jpeg,image/png,image/webp" aria-label="Attach images" hidden multiple onChange={(event) => void handleFiles(event)} ref={fileInputRef} type="file" />
				<div className="StudyComposer-footer">
					<div className="StudyComposer-options">
						<button aria-label="Attach images" className="StudyComposer-attachment" disabled={chat.status !== 'ready' || attachments.length >= 3} onClick={() => fileInputRef.current?.click()} title="Attach images, or paste them into the box" type="button"><IconPaperclip aria-hidden="true" size={16} stroke={1.8} /></button>
						<ModelSelector onChange={chooseModel} value={modelMode} />
						{STUDY_MODELS[modelMode].supportsReasoning ? (
							<ReasoningSelector onChange={chooseReasoningEffort} value={reasoningEffort} />
						) : null}
						<button aria-pressed={studyMode === 'socratic'} className={`SocraticToggle${studyMode === 'socratic' ? ' is-selected' : ''}`} onClick={toggleStudyMode} title="Ask guiding questions instead of giving answers" type="button"><IconSparkles aria-hidden="true" size={13} stroke={1.8} /> Socratic</button>
					</div>
					<div className="StudyComposer-controls">
						<ContextMeter messages={chat.messages} modelMode={modelMode} />
						{chat.status === 'submitted' || chat.status === 'streaming' ? (
							<button aria-label="Stop response" className="StudyComposer-send" onClick={() => void chat.stop()} title="Stop response" type="button"><IconPlayerStop aria-hidden="true" size={15} stroke={2} /></button>
						) : (
							<button aria-label="Send message" className="StudyComposer-send" disabled={!input.trim() && attachments.length === 0} type="submit"><IconArrowUp aria-hidden="true" size={16} stroke={2} /></button>
						)}
					</div>
				</div>
			</form>
		</div>
	)
}

function buildContextChips(
	selectionCount: number,
	hasPDFTextSelection: boolean
): StudyMessageContextChip[] {
	const chips: StudyMessageContextChip[] = []
	if (selectionCount > 0) {
		chips.push({ kind: 'shapes', label: selectionCount === 1 ? '1 shape' : `${selectionCount} shapes` })
	}
	if (hasPDFTextSelection) chips.push({ kind: 'pdf', label: 'PDF selection' })
	return chips
}

function ContextChipIcon({ kind }: { kind: StudyMessageContextChip['kind'] }) {
	if (kind === 'shapes') return <IconFocus2 aria-hidden="true" size={13} stroke={1.8} />
	if (kind === 'image') return <IconPhoto aria-hidden="true" size={13} stroke={1.8} />
	return <IconFileText aria-hidden="true" size={13} stroke={1.8} />
}

/** Cursor-style context chips pinned above a user message: canvas shapes, PDF text, attached images. */
function MessageContextChips({
	metadata,
	parts,
}: {
	metadata?: StudyMessageMetadata
	parts: StudyUIMessage['parts']
}) {
	const chips = metadata?.contextChips ?? []
	const images = parts.flatMap((part, index) =>
		part.type === 'file' && part.mediaType.startsWith('image/')
			? [{ url: part.url, filename: part.filename ?? `Image ${index + 1}` }]
			: []
	)
	if (chips.length === 0 && images.length === 0) return null

	return (
		<div className="MsgChips">
			{chips.map((chip, index) => (
				<span className="ContextChip" key={`chip-${index}`}>
					<ContextChipIcon kind={chip.kind} />
					<span className="ContextChip-label">{chip.label}</span>
					{chip.meta ? <span className="ContextChip-meta">{chip.meta}</span> : null}
				</span>
			))}
			{images.map((image, index) => (
				<span className="ContextChip" key={`image-${index}`} title={image.filename}>
					<img alt="" src={image.url} />
					<span className="ContextChip-label">{image.filename}</span>
				</span>
			))}
		</div>
	)
}

/** Shows the source metadata that reached one response without exposing source text. */
function ResponseContextReceipt({ receipt }: { receipt: StudyContextReceipt }) {
	const selectedTypes = summarizeShapeTypes(receipt.board?.selectedShapeTypes ?? [])
	const lectureSources = getStudyContextLectureSources(receipt)
	const profileLabels = receipt.profileFields.map((field) => ({
		'about-you': 'About you',
		'custom-instructions': 'Custom instructions',
		personality: 'Personality',
	})[field])

	return (
		<details className="ContextReceipt">
			<summary><IconInfoCircle aria-hidden="true" size={13} /> Context used</summary>
			<dl>
				{receipt.board ? (
					<div>
						<dt>Space</dt>
						<dd>{selectedTypes || 'No selected shapes'} · {receipt.board.visibleShapeCount} visible</dd>
					</div>
				) : null}
				<div>
					<dt>PDFs</dt>
					<dd>{receipt.pdfSources.length
						? receipt.pdfSources.map((source) => `${source.documentTitle}, p. ${source.pageNumber}`).join(' · ')
						: 'None'}</dd>
				</div>
				<div>
					<dt>Lectures</dt>
					<dd>{lectureSources.length
						? lectureSources
							.map((source) => `${source.lectureTitle}, ${formatLectureTime(source.startSecond)}`)
							.join(' · ')
						: 'None'}</dd>
				</div>
				<div><dt>Memories</dt><dd>{receipt.memories}</dd></div>
				<div><dt>Profile</dt><dd>{profileLabels.join(' · ') || 'None'}</dd></div>
				<div><dt>Craft</dt><dd>{receipt.craftDocuments.join(' · ') || 'None'}</dd></div>
				<div>
					<dt>Spotify</dt>
					<dd>{receipt.spotify.detail ?? ({
						excluded: 'Excluded',
						idle: 'Connected, idle',
						paused: 'Paused',
						playing: 'Playing',
						unavailable: 'Unavailable',
					})[receipt.spotify.state]}</dd>
				</div>
			</dl>
		</details>
	)
}

function formatLectureTime(value: number) {
	const seconds = Math.max(0, Math.floor(value))
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function summarizeShapeTypes(types: readonly string[]) {
	const counts = new Map<string, number>()
	for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1)
	return [...counts].map(([type, count]) => `${count} ${type}`).join(', ')
}

function AssistantMarkdown({
	boardID,
	children,
	editor,
	isAnimating,
}: {
	boardID: string
	children: string
	editor: Editor | null
	isAnimating: boolean
}) {
	const components = useMemo<Components>(() => ({
		a: (props) => <AssistantMarkdownLink boardID={boardID} editor={editor} {...props} />,
	}), [boardID, editor])

	return (
		<div>
			<Streamdown
				animated={{ animation: 'fadeIn', duration: 0.14 }}
				className="ChatMarkdown"
				components={components}
				controls={false}
				isAnimating={isAnimating}
				mode={isAnimating ? 'streaming' : 'static'}
				plugins={studyMarkdownPlugins}
			>
				{children}
			</Streamdown>
		</div>
	)
}

interface AssistantMarkdownLinkProps extends ComponentPropsWithoutRef<'a'> {
	boardID: string
	editor: Editor | null
	node?: unknown
}

function AssistantMarkdownLink({
	boardID,
	children,
	editor,
	href,
	node: _node,
	...props
}: AssistantMarkdownLinkProps) {
	const citation = parsePDFCitationHref(href)
	const lectureCitation = parseLectureCitationHref(href)
	const craftLinkID = parseCraftDocumentCitationHref(href)
	if (craftLinkID) {
		return (
			<button
				aria-label="Preview cited Craft document"
				className="PDFCitation"
				onClick={() => openCraftDocumentPreview(craftLinkID)}
				title="Preview linked Craft document"
				type="button"
			>
				<IconBrandCraft aria-hidden="true" size={13} stroke={1.8} />
				<span>{children}</span>
			</button>
		)
	}
	if (!citation) {
		if (lectureCitation) {
			const target = lectureCitation
			const openLectureCitation = () => {
				if (editor && focusLectureCitation(editor, target)) return
				const audioURL = `${apiRoutes.boardLectureAudio(boardID, target.lectureID)}#t=${target.startSecond}`
				window.open(audioURL, '_blank', 'noopener,noreferrer')
			}
			return (
				<button
					aria-label={`Play cited lecture at ${formatLectureTime(target.startSecond)}`}
					className="PDFCitation"
					onClick={openLectureCitation}
					title={`Play lecture at ${formatLectureTime(target.startSecond)}`}
					type="button"
				>
					<IconHeadphones aria-hidden="true" size={13} stroke={1.8} />
					<span>{children}</span>
				</button>
			)
		}
		return <a {...props} href={href} rel="noreferrer" target="_blank">{children}</a>
	}
	const target = citation

	function openCitation() {
		if (editor && focusPDFCitation(editor, target)) return
		const originalPDFURL = `${apiRoutes.boardDocumentOriginal(boardID, target.documentID)}#page=${target.pageNumber}`
		window.open(originalPDFURL, '_blank', 'noopener,noreferrer')
	}

	return (
		<button
			aria-label={`Show cited PDF page ${citation.pageNumber}`}
			className="PDFCitation"
			onClick={openCitation}
			title={`Show page ${citation.pageNumber} on the canvas`}
			type="button"
		>
			<IconFileText aria-hidden="true" size={13} stroke={1.8} />
			<span>{children}</span>
		</button>
	)
}

function ModelSelector({ onChange, value }: { onChange: (mode: StudyModelMode) => void; value: StudyModelMode }) {
	const model = STUDY_MODELS[value]
	return (
		<label className="ModelSelector" title={model.description}>
			{value === 'quicker' ? <IconBolt aria-hidden="true" size={13} /> : <IconBrain aria-hidden="true" size={13} />}
			<select aria-label="Response mode" onChange={(event) => {
				const mode = event.target.value
				if (mode === 'quicker' || mode === 'smarter') onChange(mode)
			}} value={value}>
				{(['quicker', 'smarter'] as const).map((mode) => (
					<option key={mode} value={mode}>{STUDY_MODELS[mode].label}</option>
				))}
			</select>
			<IconChevronDown aria-hidden="true" className="ModelSelector-chevron" size={12} stroke={2} />
		</label>
	)
}

function ReasoningSelector({
	onChange,
	value,
}: {
	onChange: (effort: StudyReasoningEffort) => void
	value: StudyReasoningEffort
}) {
	return (
		<select
			aria-label="Reasoning effort"
			className="ReasoningSelector"
			onChange={(event) => onChange(studyReasoningEffortSchema.parse(event.target.value))}
			title="Control how much reasoning the smarter model uses"
			value={value}
		>
			{STUDY_REASONING_EFFORTS.map((effort) => (
				<option key={effort} value={effort}>
					{effort[0]?.toUpperCase()}{effort.slice(1)}
				</option>
			))}
		</select>
	)
}

function ContextMeter({ messages, modelMode }: { messages: StudyUIMessage[]; modelMode: StudyModelMode }) {
	const reportedMetadata = messages.findLast(
		(message) => message.role === 'assistant' && message.metadata?.contextTokens !== undefined
	)?.metadata
	const estimatedTokens = Math.ceil(JSON.stringify(messages).length / 4) + 700
	const contextWindowTokens = reportedMetadata?.modelMode === modelMode
		? reportedMetadata.contextWindowTokens ?? getStudyModel(modelMode).contextWindowTokens
		: getStudyModel(modelMode).contextWindowTokens
	const contextTokens = Math.min(
		contextWindowTokens,
		Math.max(reportedMetadata?.contextTokens ?? 0, estimatedTokens)
	)
	const percentage = contextWindowTokens > 0
		? (contextTokens / contextWindowTokens) * 100
		: 0
	const percentageLabel = percentage > 0 && percentage < 1
		? '<1%'
		: `${Math.round(percentage)}%`
	const accessibleLabel = `${formatTokenCount(contextTokens)} of ${formatTokenCount(contextWindowTokens)} context tokens used, ${percentageLabel}`
	const style = { '--context-fill': `${percentage}%` } as CSSProperties

	return (
		<div aria-label={accessibleLabel} className="ContextMeter" role="img" title={accessibleLabel}>
			<span aria-hidden="true" className="ContextMeter-chart" style={style} />
			<span>{percentageLabel}</span>
		</div>
	)
}

function formatTokenCount(tokens: number) {
	if (tokens < 1_000) return String(tokens)
	if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}K`
	return `${Math.round(tokens / 1_000)}K`
}

function isAppliedOutput(output: unknown) {
	return Boolean(
		output &&
		hasObjectType(output) &&
		readProperty(output, 'applied') === true
	)
}

type ProposalCallStatus = 'preparing' | 'ready' | 'accepted' | 'rejected' | 'error'

function proposalCallStatus(state: string, applied: boolean): ProposalCallStatus {
	if (state === 'input-available') return 'ready'
	if (state === 'output-error') return 'error'
	if (state === 'output-denied') return 'rejected'
	if (state === 'output-available') return applied ? 'accepted' : 'rejected'
	return 'preparing'
}

function ProposalToolCall({
	acceptDisabled = false,
	input,
	onAccept,
	onReject,
	status,
	toolName,
}: {
	acceptDisabled?: boolean
	input: unknown
	onAccept?: () => Promise<void> | void
	onReject?: () => Promise<void> | void
	status: ProposalCallStatus
	toolName: StudyToolName
}) {
	const [isExpanded, setIsExpanded] = useState(false)
	const [pendingDecision, setPendingDecision] = useState<'accept' | 'reject' | null>(null)
	const preview = getProposalPreview(toolName, input)
	const label = proposalShortLabel(toolName)
	const isReady = status === 'ready'
	const canPreview = status !== 'preparing'

	async function decide(decision: 'accept' | 'reject') {
		const callback = decision === 'accept' ? onAccept : onReject
		if (!callback || pendingDecision) return
		setPendingDecision(decision)
		try {
			await callback()
		} finally {
			setPendingDecision(null)
		}
	}

	return (
		<div
			aria-busy={pendingDecision !== null}
			className={`ProposalCall ProposalCall--${status}`}
		>
			<div className="ProposalCall-row">
				<button
					aria-expanded={isExpanded}
					className="ProposalCall-toggle"
					disabled={!canPreview}
					onClick={() => setIsExpanded((expanded) => !expanded)}
					title={canPreview ? `${isExpanded ? 'Hide' : 'Preview'} ${label.toLowerCase()}` : undefined}
					type="button"
				>
					<IconSparkles aria-hidden="true" className="ProposalCall-icon" size={16} stroke={1.9} />
					<span className="ProposalCall-label">
						<strong>{label}</strong>
						<small>{canPreview ? (isExpanded ? 'Hide preview' : preview.description) : 'Generating…'}</small>
					</span>
				</button>
				{isReady ? (
					<div aria-label={`${label} approval`} className="ProposalCall-actions" role="group">
						<button
							aria-label={`Accept ${label.toLowerCase()}`}
							className="ProposalCall-action ProposalCall-action--accept"
							disabled={acceptDisabled || pendingDecision !== null}
							onClick={() => void decide('accept')}
							title={isMemoryTool(toolName) ? 'Accept and save' : 'Accept and add to space'}
							type="button"
						>
							<IconCheck aria-hidden="true" size={15} stroke={2.2} />
						</button>
						<button
							aria-label={`Reject ${label.toLowerCase()}`}
							className="ProposalCall-action ProposalCall-action--reject"
							disabled={pendingDecision !== null}
							onClick={() => void decide('reject')}
							title="Reject"
							type="button"
						>
							<IconX aria-hidden="true" size={15} stroke={2.2} />
						</button>
					</div>
				) : (
					<small className="ProposalCall-state">{proposalCallStateLabel(status, toolName)}</small>
				)}
			</div>
			{isExpanded ? (
				<div className="ProposalCall-preview">
					<p>{preview.description}</p>
					{preview.details.length ? (
						<dl>
							{preview.details.map((detail, index) => (
								<div key={`${detail.label}-${index}`}>
									<dt>{detail.label}</dt>
									<dd>{detail.value}</dd>
								</div>
							))}
						</dl>
					) : null}
				</div>
			) : null}
		</div>
	)
}

function proposalCallStateLabel(status: ProposalCallStatus, toolName: StudyToolName) {
	if (status === 'preparing') return 'Generating…'
	if (status === 'accepted') return isMemoryTool(toolName) ? 'Saved' : 'Added'
	if (status === 'rejected') return 'Rejected'
	if (status === 'error') return 'Failed'
	return 'Ready'
}

function addProposalOutput(
	addToolOutput: AddStudyToolOutput,
	toolName: StudyToolName,
	toolCallID: string,
	output: { applied: boolean }
) {
	if (toolName === 'addReviewNote') {
		return addToolOutput({ tool: 'addReviewNote', toolCallId: toolCallID, output })
	}
	if (toolName === 'createFlashcards') {
		return addToolOutput({ tool: 'createFlashcards', toolCallId: toolCallID, output })
	}
	if (toolName === 'createQuiz') {
		return addToolOutput({ tool: 'createQuiz', toolCallId: toolCallID, output })
	}
	if (toolName === 'createWalkthrough') {
		return addToolOutput({ tool: 'createWalkthrough', toolCallId: toolCallID, output })
	}
	if (toolName === 'createConceptMap') {
		return addToolOutput({ tool: 'createConceptMap', toolCallId: toolCallID, output })
	}
	if (toolName === 'createPracticeSet') {
		return addToolOutput({ tool: 'createPracticeSet', toolCallId: toolCallID, output })
	}
	if (toolName === 'createStudyPack') {
		return addToolOutput({ tool: 'createStudyPack', toolCallId: toolCallID, output })
	}
	if (toolName === 'writeEquation') {
		return addToolOutput({ tool: 'writeEquation', toolCallId: toolCallID, output })
	}
	if (toolName === 'composeCanvas') {
		return addToolOutput({ tool: 'composeCanvas', toolCallId: toolCallID, output })
	}
	if (toolName === 'saveMemory') {
		return addToolOutput({ tool: 'saveMemory', toolCallId: toolCallID, output })
	}
	return addToolOutput({ tool: 'recordMistake', toolCallId: toolCallID, output })
}

function addProposalError(
	addToolOutput: AddStudyToolOutput,
	toolName: StudyToolName,
	toolCallID: string,
	errorText: string
) {
	if (toolName === 'addReviewNote') {
		return addToolOutput({
			tool: 'addReviewNote',
			toolCallId: toolCallID,
			state: 'output-error',
			errorText,
		})
	}
	if (toolName === 'createFlashcards') {
		return addToolOutput({
			tool: 'createFlashcards',
			toolCallId: toolCallID,
			state: 'output-error',
			errorText,
		})
	}
	if (toolName === 'createQuiz') return addToolOutput({ tool: 'createQuiz', toolCallId: toolCallID, state: 'output-error', errorText })
	if (toolName === 'createWalkthrough') return addToolOutput({ tool: 'createWalkthrough', toolCallId: toolCallID, state: 'output-error', errorText })
	if (toolName === 'createConceptMap') return addToolOutput({ tool: 'createConceptMap', toolCallId: toolCallID, state: 'output-error', errorText })
	if (toolName === 'createPracticeSet') return addToolOutput({ tool: 'createPracticeSet', toolCallId: toolCallID, state: 'output-error', errorText })
	if (toolName === 'createStudyPack') return addToolOutput({ tool: 'createStudyPack', toolCallId: toolCallID, state: 'output-error', errorText })
	if (toolName === 'writeEquation') return addToolOutput({ tool: 'writeEquation', toolCallId: toolCallID, state: 'output-error', errorText })
	if (toolName === 'composeCanvas') return addToolOutput({ tool: 'composeCanvas', toolCallId: toolCallID, state: 'output-error', errorText })
	if (toolName === 'saveMemory') return addToolOutput({ tool: 'saveMemory', toolCallId: toolCallID, state: 'output-error', errorText })
	return addToolOutput({ tool: 'recordMistake', toolCallId: toolCallID, state: 'output-error', errorText })
}

function LeakedProposalCall({
	boardID,
	conversationID,
	documentClock,
	editor,
	onAgentAction,
	proposal,
}: {
	boardID: string
	conversationID: string
	documentClock?: number
	editor: Editor | null
	onAgentAction: () => void
	proposal: LeakedProposal
}) {
	const [status, setStatus] = useState<ProposalCallStatus>('ready')

	async function applyLeakedProposal() {
		try {
			if (proposal.toolName === 'saveMemory') {
				await saveProposedMemory(boardID, proposal.input)
			} else if (proposal.toolName === 'recordMistake') {
				await recordProposedMistake(boardID, proposal.input)
			} else {
				if (!editor) return
				const beforeRecords = captureCanvasRecords(editor)
				const effect = applyProposal(editor, proposal.toolName, proposal.input, { documentClock })
				const action = createAgentAction(beforeRecords, captureCanvasRecords(editor), {
					baseDocumentClock: documentClock,
					conversationID,
					planID: effect.planID,
					toolName: proposal.toolName,
				})
				if (action) {
					try {
						await persistAgentAction(boardID, action)
						onAgentAction()
					} catch (ledgerError) {
						rollbackUnpersistedAgentAction(editor, action)
						throw ledgerError
					}
				}
				await persistProposalEffect(boardID, effect)
			}
			setStatus('accepted')
		} catch {
			setStatus('error')
		}
	}

	return (
		<ProposalToolCall
			acceptDisabled={!editor && !isMemoryTool(proposal.toolName)}
			input={proposal.input}
			onAccept={applyLeakedProposal}
			onReject={() => setStatus('rejected')}
			status={status}
			toolName={proposal.toolName}
		/>
	)
}

function isMemoryTool(toolName: StudyToolName) {
	return toolName === 'recordMistake' || toolName === 'saveMemory'
}

function createConversationTitle(message: string) {
	const normalized = message.trim().replace(/\s+/g, ' ')
	return normalized.length > 52 ? `${normalized.slice(0, 51).trimEnd()}…` : normalized
}

function formatConversationDate(value: string) {
	return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value))
}

function formatAgentActionName(toolName: string) {
	const labels: Record<string, string> = {
		addReviewNote: 'Review note',
		composeCanvas: 'Canvas plan',
		createConceptMap: 'Concept map',
		createFlashcards: 'Flashcards',
		createPracticeSet: 'Practice set',
		createQuiz: 'Quiz',
		createStudyPack: 'Cited study pack',
		createWalkthrough: 'Walkthrough',
		writeEquation: 'Equation',
	}
	return labels[toolName] ?? 'AI canvas change'
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong'
}

function estimateAttachmentBytes(attachments: FileUIPart[]) {
	return attachments.reduce((total, attachment) => {
		const comma = attachment.url.indexOf(',')
		const encodedLength = comma >= 0 ? attachment.url.length - comma - 1 : attachment.url.length
		return total + Math.floor(encodedLength * 0.75)
	}, 0)
}
