import {
	FLASHCARD_SHAPE_TYPE,
	CONCEPT_MAP_SHAPE_TYPE,
	QUIZ_SHAPE_TYPE,
	REVIEW_SHAPE_TYPE,
	WALKTHROUGH_SHAPE_TYPE,
	DEFAULT_STUDY_MODEL_MODE,
	STUDY_MODELS,
	apiRoutes,
	conceptMapProposalSchema,
	flashcardProposalSchema,
	getStudyModel,
	quizProposalSchema,
	mistakeProposalSchema,
	practiceSetProposalSchema,
	reviewProposalSchema,
	walkthroughProposalSchema,
	type ConceptMapProposal,
	type CanvasContext,
	type FlashcardProposal,
	type MistakeProposal,
	type PracticeSetProposal,
	type QuizProposal,
	type ReviewProposal,
	type StudyConversation,
	type StudyMessageMetadata,
	type StudyModelMode,
	type StudyMode,
	type WalkthroughProposal,
} from '@agentboard/shared'
import { useChat, type UseChatHelpers } from '@ai-sdk/react'
import { MessageScroller } from '@shadcn/react/message-scroller'
import {
	IconArrowDown,
	IconArrowUp,
	IconBolt,
	IconBrain,
	IconCards,
	IconCircleCheck,
	IconFileText,
	IconFocus2,
	IconHistory,
	IconPaperclip,
	IconPlayerStop,
	IconPlus,
	IconRefresh,
	IconSparkles,
	IconX,
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
import type { ChangeEvent, ComponentPropsWithoutRef, CSSProperties, FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Streamdown, type Components } from 'streamdown'
import { Editor, createShapeId, type TLShapePartial } from 'tldraw'
import { TextShimmer } from '../../../components/TextShimmer'
import { apiRequest } from '../../../lib/api'
import { getLocalStorageItem, setLocalStorageItem } from '../../../lib/browser/localStorage'
import { captureCanvasContext } from '../lib/canvasContextCapture'
import { resolveCanvasContextForRequest } from '../lib/canvasContextRequest'
import { focusPDFCitation, parsePDFCitationHref } from '../lib/pdfCitation'
import { studyMarkdownPlugins } from '../lib/studyMath'
import {
	looksLikeLeakedProposal,
	parseLeakedProposal,
	type LeakedProposal,
} from '../lib/studyProposal'
import type {
	ConceptMapShape,
	FlashcardShape,
	QuizShape,
	ReviewShape,
	WalkthroughShape,
} from '../shapes/studyShapeUtils'

interface StudyPanelProps {
	boardID: string
	editor: Editor | null
}

const STUDY_MODEL_STORAGE_KEY = 'agentboard.study-model'
const STUDY_MODE_STORAGE_KEY = 'agentboard.study-mode'
const MAX_ATTACHMENT_BYTES = 4 * 1_024 * 1_024
const ALLOWED_IMAGE_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])

export function StudyPanel({ boardID, editor }: StudyPanelProps) {
	const [conversations, setConversations] = useState<StudyConversation[] | null>(null)
	const [currentConversationID, setCurrentConversationID] = useState<string | null>(null)
	const [historyOpen, setHistoryOpen] = useState(false)
	const [conversationError, setConversationError] = useState<string | null>(null)
	const [isCreatingConversation, setIsCreatingConversation] = useState(false)
	const [selectionCount, setSelectionCount] = useState(0)
	const currentConversation = conversations?.find(({ id }) => id === currentConversationID) ?? null

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

	function updateConversation(message: string) {
		if (!currentConversation) return
		const shouldSetTitle = currentConversation.title === 'New conversation'
		const nextTitle = shouldSetTitle ? createConversationTitle(message) : currentConversation.title
		const optimistic = { ...currentConversation, title: nextTitle, updatedAt: new Date().toISOString() }
		setConversations((current) => [optimistic, ...(current ?? []).filter(({ id }) => id !== optimistic.id)])
		void apiRequest<{ conversation: StudyConversation }>(
			apiRoutes.studyConversation(boardID, currentConversation.id),
			{
				body: JSON.stringify(shouldSetTitle ? { title: nextTitle } : {}),
				method: 'PATCH',
			}
		).then((response) => {
			setConversations((current) => [
				response.conversation,
				...(current ?? []).filter(({ id }) => id !== response.conversation.id),
			])
		}).catch(() => undefined)
	}

	return (
		<div className="StudyPanel">
			<header className="StudyPanel-header">
				<IconSparkles className="StudyPanel-mark" aria-hidden="true" size={16} stroke={1.8} />
				<h2>Study</h2>
				{currentConversation ? (
					<span className="StudyPanel-conversation" title={currentConversation.title}>{currentConversation.title}</span>
				) : null}
				<div className="StudyPanel-actions">
					<button aria-label="New conversation" disabled={isCreatingConversation} onClick={() => void createConversation()} title="New conversation" type="button"><IconPlus aria-hidden="true" size={16} /></button>
					<button aria-controls="study-history" aria-expanded={historyOpen} aria-label="Conversation history" onClick={() => setHistoryOpen((open) => !open)} title="Conversation history" type="button"><IconHistory aria-hidden="true" size={16} /></button>
				</div>
			</header>
			<div className="StudyPanel-main">
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
				{conversationError ? <p className="StudyPanel-error" role="alert">{conversationError}</p> : null}
				{currentConversation ? (
					<StudyConversationSession
						boardID={boardID}
						conversation={currentConversation}
						editor={editor}
						key={currentConversation.agentName}
						onActivity={updateConversation}
						selectionCount={selectionCount}
					/>
				) : conversations ? (
					<div className="StudyPanel-loading"><p>No conversations yet.</p><button onClick={() => void createConversation()} type="button">Start one</button></div>
				) : (
					<div className="StudyPanel-loading"><TextShimmer>Loading conversations…</TextShimmer></div>
				)}
			</div>
		</div>
	)
}

interface StudyConversationSessionProps {
	boardID: string
	conversation: StudyConversation
	editor: Editor | null
	onActivity: (message: string) => void
	selectionCount: number
}

function StudyConversationSession({ boardID, conversation, editor, onActivity, selectionCount }: StudyConversationSessionProps) {
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
		return <div className="StudyPanel-loading"><TextShimmer>Opening conversation…</TextShimmer></div>
	}

	return (
		<StudyConversationChat
			boardID={boardID}
			conversation={conversation}
			editor={editor}
			initialMessages={initialMessages}
			onActivity={onActivity}
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
	recordMistake: { input: MistakeProposal; output: { applied: boolean } }
}

type StudyUIMessage = UIMessage<StudyMessageMetadata, Record<string, never>, StudyTools>
type StudyToolName = keyof StudyTools
type AddStudyToolOutput = UseChatHelpers<StudyUIMessage>['addToolOutput']

interface StudyConversationChatProps extends StudyConversationSessionProps {
	initialMessages: StudyUIMessage[]
}

function StudyConversationChat({
	boardID,
	conversation,
	editor,
	initialMessages,
	onActivity,
	selectionCount,
}: StudyConversationChatProps) {
	const [input, setInput] = useState('')
	const [attachments, setAttachments] = useState<FileUIPart[]>([])
	const [attachmentError, setAttachmentError] = useState<string | null>(null)
	const [modelMode, setModelMode] = useState<StudyModelMode>(readStudyModelMode)
	const [studyMode, setStudyMode] = useState<StudyMode>(readStudyMode)
	const fileInputRef = useRef<HTMLInputElement>(null)
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
					studyMode,
					trigger,
				},
			}
		},
	}), [boardID, conversation.id, editor, modelMode, studyMode])
	const chat = useChat<StudyUIMessage>({
		id: conversation.id,
		messages: initialMessages,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		transport,
	})

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const text = input.trim()
		if ((!text && attachments.length === 0) || chat.status !== 'ready') return
		setInput('')
		setAttachments([])
		setAttachmentError(null)
		if (fileInputRef.current) fileInputRef.current.value = ''
		onActivity(text || 'Image question')
		void chat.sendMessage({ files: attachments, text })
	}

	async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
		const files = event.target.files
		if (!files?.length) return
		setAttachmentError(null)
		const candidates = Array.from(files)
		if (attachments.length + candidates.length > 3) {
			setAttachmentError('Attach up to three images at a time.')
			event.target.value = ''
			return
		}
		if (candidates.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type))) {
			setAttachmentError('Use PNG, JPEG, WebP, or GIF images.')
			event.target.value = ''
			return
		}
		const totalBytes = candidates.reduce((total, file) => total + file.size, 0) + estimateAttachmentBytes(attachments)
		if (totalBytes > MAX_ATTACHMENT_BYTES) {
			setAttachmentError('Keep image attachments under 4 MB total.')
			event.target.value = ''
			return
		}
		try {
			const parts = await convertFileListToFileUIParts(files)
			setAttachments((current) => [...current, ...parts])
		} catch {
			setAttachmentError('Those images could not be attached.')
		} finally {
			event.target.value = ''
		}
	}

	function chooseModel(mode: StudyModelMode) {
		setModelMode(mode)
		setLocalStorageItem(STUDY_MODEL_STORAGE_KEY, mode)
	}

	function toggleStudyMode() {
		const nextMode = studyMode === 'socratic' ? 'direct' : 'socratic'
		setStudyMode(nextMode)
		setLocalStorageItem(STUDY_MODE_STORAGE_KEY, nextMode)
	}

	async function resolveProposal(
		toolName: StudyToolName,
		toolCallID: string,
		proposal: unknown,
		applied: boolean
	) {
		try {
			if (applied) {
				if (toolName === 'recordMistake') {
					const mistake = mistakeProposalSchema.parse(proposal)
					await apiRequest(apiRoutes.boardMistakes(boardID), {
						body: JSON.stringify(mistake),
						method: 'POST',
					})
				} else {
					if (!editor) throw new Error('The canvas is not ready')
					const effect = applyProposal(editor, toolName, proposal)
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
									<p className="Eyebrow">In the margins</p>
									<h3>Ask about anything on this board.</h3>
									<p>Select a note or sketch first and I’ll use it as context. I can check reasoning, explain a concept, or propose flashcards and quizzes.</p>
									<div className="StudyPrompts">
										<button onClick={() => setInput('Check my selected work and tell me what I misunderstood.')} type="button"><IconCircleCheck aria-hidden="true" size={17} /> Check my reasoning</button>
										<button onClick={() => setInput('Turn the selected material into flashcards.')} type="button"><IconCards aria-hidden="true" size={17} /> Make flashcards</button>
										<button onClick={() => setInput('Make me three more practice problems like the selected example.')} type="button"><IconBrain aria-hidden="true" size={17} /> Practice this</button>
										<button onClick={() => setInput('Summarize the selected unit as a concept map.')} type="button"><IconSparkles aria-hidden="true" size={17} /> Concept map</button>
									</div>
								</MessageScroller.Item>
							) : null}

							{chat.messages.map((message) => (
								<MessageScroller.Item
									className={`ChatMessage ChatMessage--${message.role}`}
									key={message.id}
									messageId={message.id}
									scrollAnchor={message.role === 'user'}
								>
									<span className="sr-only">{message.role === 'user' ? 'You' : 'Study partner'}</span>
									{message.parts.map((part, index) => {
									if (part.type === 'text') {
								const leakedProposal = message.role === 'assistant' ? parseLeakedProposal(part.text) : null
								if (leakedProposal) return <LeakedProposalCard boardID={boardID} editor={editor} key={index} proposal={leakedProposal} />
								if (message.role === 'assistant' && looksLikeLeakedProposal(part.text)) {
									const isPending = chat.status === 'streaming' && message.id === chat.messages.at(-1)?.id
									return <PendingLeakedProposalCard isPending={isPending} key={index} />
								}
								if (message.role === 'user') return <p key={index}>{part.text}</p>
								const isAnimating = chat.status === 'streaming' && message.id === chat.messages.at(-1)?.id
										return <AssistantMarkdown boardID={boardID} editor={editor} isAnimating={isAnimating} key={index}>{part.text}</AssistantMarkdown>
									}
									if (part.type === 'file' && part.mediaType.startsWith('image/')) {
										return <img alt={part.filename ?? 'Image attachment'} className="ChatAttachment" key={index} src={part.url} />
									}
								if (!isToolUIPart(part)) return null
								const toolName = getToolName(part)
								if (!isStudyToolName(toolName)) return null
								const isReady = part.state === 'input-available'
								const isApplied = part.state === 'output-available' && isAppliedOutput(part.output)
								return (
									<div className="ProposalCard" key={index}>
										<strong>{proposalTitle(toolName)}</strong>
										<p>{summarizeProposal(toolName, part.input)}</p>
										{isReady ? (
											<div>
						<button className="Button Button--primary" onClick={() => void resolveProposal(toolName, part.toolCallId, part.input, true)} type="button">{toolName === 'recordMistake' ? 'Save mistake' : 'Add to board'}</button>
												<button className="TextButton" onClick={() => void resolveProposal(toolName, part.toolCallId, part.input, false)} type="button">Dismiss</button>
											</div>
										) : <small>{proposalStateLabel(part.state, isApplied, toolName)}</small>}
									</div>
								)
									})}
								</MessageScroller.Item>
							))}
							{chat.status === 'submitted' || chat.status === 'streaming' ? (
								<MessageScroller.Item messageId="study-response-status">
									<TextShimmer className="StudyThinking">Reading your selection…</TextShimmer>
								</MessageScroller.Item>
							) : null}
							{chat.error ? (
								<div className="StudyChatError" role="alert">
									<span>Something went wrong while answering.</span>
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
				{selectionCount > 0 ? (
					<div className="StudyContextChip" role="status">
						<IconFocus2 aria-hidden="true" size={13} stroke={1.8} />
						{selectionCount === 1 ? '1 shape selected as context' : `${selectionCount} shapes selected as context`}
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
				}} placeholder="Ask about your board…" rows={2} value={input} />
				<div className="StudyComposer-footer">
					<div className="StudyComposer-actions">
						<input accept="image/gif,image/jpeg,image/png,image/webp" aria-label="Attach images" hidden multiple onChange={(event) => void handleFiles(event)} ref={fileInputRef} type="file" />
						<button aria-label="Attach images" className="StudyComposer-attachment" disabled={chat.status !== 'ready' || attachments.length >= 3} onClick={() => fileInputRef.current?.click()} title="Attach images" type="button"><IconPaperclip aria-hidden="true" size={16} stroke={1.8} /></button>
						<ModelSelector onChange={chooseModel} value={modelMode} />
						<button aria-pressed={studyMode === 'socratic'} className={`SocraticToggle${studyMode === 'socratic' ? ' is-selected' : ''}`} onClick={toggleStudyMode} title="Ask guiding questions instead of giving answers" type="button">Socratic</button>
					</div>
					<div className="StudyComposer-controls">
						<ContextMeter messages={chat.messages} modelMode={modelMode} />
						{chat.status === 'submitted' || chat.status === 'streaming' ? (
							<button aria-label="Stop response" className="StudyComposer-send" onClick={() => void chat.stop()} title="Stop response" type="button"><IconPlayerStop aria-hidden="true" size={15} stroke={2} /></button>
						) : (
							<button aria-label="Send message" className="StudyComposer-send" disabled={!input.trim() && attachments.length === 0} type="submit"><IconArrowUp aria-hidden="true" size={17} stroke={2} /></button>
						)}
					</div>
				</div>
			</form>
		</div>
	)
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
	if (!citation) {
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
	return (
		<div aria-label="Response mode" className="ModelSelector" role="group">
			{(['quicker', 'smarter'] as const).map((mode) => {
				const model = STUDY_MODELS[mode]
				return (
					<button aria-pressed={value === mode} className={value === mode ? 'is-selected' : undefined} key={mode} onClick={() => onChange(mode)} title={model.description} type="button">
						{mode === 'quicker' ? <IconBolt aria-hidden="true" size={13} /> : <IconBrain aria-hidden="true" size={13} />}
						{model.label}
					</button>
				)
			})}
		</div>
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

type ProposalEffect =
	| { kind: 'flashcards'; cards: Array<{ back: string; front: string; shapeID: string }> }
	| { kind: 'none' }

function applyProposal(editor: Editor, toolName: string, input: unknown): ProposalEffect {
	if (toolName === 'addReviewNote') {
		const proposal = reviewProposalSchema.parse(input)
		const id = createShapeId()
		const shape: TLShapePartial<ReviewShape> = {
			id,
			type: REVIEW_SHAPE_TYPE,
			x: proposal.x,
			y: proposal.y,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'review' } },
			props: {
				w: 310,
				h: 210,
				title: proposal.title,
				body: proposal.body,
				severity: proposal.severity,
				resolved: false,
				schemaVersion: 1,
			},
		}
		editor.createShape(shape).setSelectedShapes([id])
		return { kind: 'none' }
	}

	if (toolName === 'createFlashcards') {
		const proposal = flashcardProposalSchema.parse(input)
		const shapeIDs = proposal.cards.map(() => createShapeId())
		const shapes: TLShapePartial<FlashcardShape>[] = proposal.cards.map((card, index) => ({
			id: shapeIDs[index],
			type: FLASHCARD_SHAPE_TYPE,
			x: proposal.x + (index % 3) * 325,
			y: proposal.y + Math.floor(index / 3) * 215,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'flashcard' } },
			props: {
				w: 300,
				h: 190,
				front: card.front,
				back: card.back,
				revealed: false,
				schemaVersion: 1,
			},
		}))
		editor.createShapes(shapes).setSelectedShapes(shapeIDs)
		return {
			kind: 'flashcards',
			cards: proposal.cards.map((card, index) => ({ ...card, shapeID: shapeIDs[index] })),
		}
	}

	if (toolName === 'createQuiz') {
		const proposal = quizProposalSchema.parse(input)
		const id = createShapeId()
		const shape: TLShapePartial<QuizShape> = {
			id,
			type: QUIZ_SHAPE_TYPE,
			x: proposal.x,
			y: proposal.y,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'quiz' } },
			props: {
				w: 370,
				h: 350,
				question: proposal.question,
				options: proposal.options,
				correctIndex: proposal.correctIndex,
				explanation: proposal.explanation,
				selectedIndex: -1,
				showResult: false,
				schemaVersion: 1,
			},
		}
		editor.createShape(shape).setSelectedShapes([id])
		return { kind: 'none' }
	}

	if (toolName === 'createWalkthrough') {
		const proposal = walkthroughProposalSchema.parse(input)
		const id = createShapeId()
		const shape: TLShapePartial<WalkthroughShape> = {
			id,
			type: WALKTHROUGH_SHAPE_TYPE,
			x: proposal.x,
			y: proposal.y,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'walkthrough' } },
			props: {
				w: 430,
				h: 340,
				title: proposal.title,
				steps: proposal.steps,
				currentStep: 0,
				revealed: false,
				schemaVersion: 1,
			},
		}
		editor.createShape(shape).setSelectedShapes([id])
		return { kind: 'none' }
	}

	if (toolName === 'createConceptMap') {
		const proposal = conceptMapProposalSchema.parse(input)
		const id = createShapeId()
		const shape: TLShapePartial<ConceptMapShape> = {
			id,
			type: CONCEPT_MAP_SHAPE_TYPE,
			x: proposal.x,
			y: proposal.y,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'concept-map' } },
			props: {
				w: 580,
				h: 410,
				title: proposal.title,
				nodes: proposal.nodes,
				edges: proposal.edges,
				schemaVersion: 1,
			},
		}
		editor.createShape(shape).setSelectedShapes([id])
		return { kind: 'none' }
	}

	if (toolName === 'createPracticeSet') {
		const proposal = practiceSetProposalSchema.parse(input)
		const shapeIDs = proposal.quizzes.map(() => createShapeId())
		const shapes: TLShapePartial<QuizShape>[] = proposal.quizzes.map((quiz, index) => ({
			id: shapeIDs[index],
			type: QUIZ_SHAPE_TYPE,
			x: proposal.x + (index % 2) * 390,
			y: proposal.y + Math.floor(index / 2) * 370,
			meta: { agentboard: { createdBy: 'study-agent', proposalType: 'practice-set' } },
			props: {
				w: 370,
				h: 350,
				question: quiz.question,
				options: quiz.options,
				correctIndex: quiz.correctIndex,
				explanation: quiz.explanation,
				selectedIndex: -1,
				showResult: false,
				schemaVersion: 1,
			},
		}))
		editor.createShapes(shapes).setSelectedShapes(shapeIDs)
		return { kind: 'none' }
	}

	throw new Error(`Unknown proposal type: ${toolName}`)
}

async function persistProposalEffect(boardID: string, effect: ProposalEffect) {
	if (effect.kind !== 'flashcards') return
	await apiRequest(apiRoutes.boardFlashcards(boardID), {
		body: JSON.stringify({ cards: effect.cards }),
		method: 'POST',
	}).catch(() => undefined)
}

function isStudyToolName(value: string): value is StudyToolName {
	return [
		'addReviewNote',
		'createConceptMap',
		'createFlashcards',
		'createPracticeSet',
		'createQuiz',
		'createWalkthrough',
		'recordMistake',
	].includes(value)
}

function isAppliedOutput(output: unknown) {
	return Boolean(
		output &&
		typeof output === 'object' &&
		Reflect.get(output, 'applied') === true
	)
}

function proposalStateLabel(state: string, applied: boolean, toolName: StudyToolName) {
	if (state === 'input-streaming') return 'Preparing proposal…'
	if (state === 'output-error') return 'Unable to add this proposal'
	if (state === 'output-denied') return 'Dismissed'
	if (state === 'output-available') return applied
		? toolName === 'recordMistake' ? 'Saved to learning history' : 'Added to board'
		: 'Dismissed'
	return 'Preparing proposal…'
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
	return addToolOutput({ tool: 'recordMistake', toolCallId: toolCallID, state: 'output-error', errorText })
}

function proposalTitle(toolName: string) {
	if (toolName === 'addReviewNote') return 'Review note proposal'
	if (toolName === 'createFlashcards') return 'Flashcard proposal'
	if (toolName === 'createQuiz') return 'Quiz proposal'
	if (toolName === 'createWalkthrough') return 'Worked-example proposal'
	if (toolName === 'createConceptMap') return 'Concept-map proposal'
	if (toolName === 'createPracticeSet') return 'Practice-set proposal'
	if (toolName === 'recordMistake') return 'Mistake record proposal'
	return 'Board proposal'
}

function summarizeProposal(toolName: string, input: unknown) {
	if (toolName === 'createFlashcards') {
		const proposal = flashcardProposalSchema.safeParse(input)
		return proposal.success
			? `${proposal.data.cards.length} flashcards ready. Answers stay hidden until each card is flipped.`
			: 'Preparing flashcards…'
	}
	if (toolName === 'createQuiz') {
		const proposal = quizProposalSchema.safeParse(input)
		return proposal.success
			? `One ${proposal.data.options.length}-option quiz ready. The answer stays hidden until you choose.`
			: 'Preparing a quiz…'
	}
	if (toolName === 'addReviewNote') {
		return reviewProposalSchema.safeParse(input).success
			? 'A private review note is ready to place beside the selected work.'
			: 'Preparing a review note…'
	}
	if (toolName === 'createWalkthrough') {
		const proposal = walkthroughProposalSchema.safeParse(input)
		return proposal.success ? `${proposal.data.steps.length} guided steps, revealed one at a time.` : 'Preparing a worked example…'
	}
	if (toolName === 'createConceptMap') {
		const proposal = conceptMapProposalSchema.safeParse(input)
		return proposal.success ? `${proposal.data.nodes.length} concepts with ${proposal.data.edges.length} explicit relationships.` : 'Preparing a concept map…'
	}
	if (toolName === 'createPracticeSet') {
		const proposal = practiceSetProposalSchema.safeParse(input)
		return proposal.success ? `${proposal.data.quizzes.length} new interactive practice problems.` : 'Preparing practice problems…'
	}
	if (toolName === 'recordMistake') {
		const proposal = mistakeProposalSchema.safeParse(input)
		return proposal.success ? `${proposal.data.title} will be saved to your private learning history.` : 'Preparing a mistake record…'
	}
	return 'A board item is ready for review.'
}

function LeakedProposalCard({ boardID, editor, proposal }: { boardID: string; editor: Editor | null; proposal: LeakedProposal }) {
	const [state, setState] = useState<'ready' | 'added' | 'dismissed' | 'error'>('ready')

	async function applyLeakedProposal() {
		try {
			if (proposal.toolName === 'recordMistake') {
				await apiRequest(apiRoutes.boardMistakes(boardID), {
					body: JSON.stringify(mistakeProposalSchema.parse(proposal.input)),
					method: 'POST',
				})
			} else {
				if (!editor) return
				await persistProposalEffect(boardID, applyProposal(editor, proposal.toolName, proposal.input))
			}
			setState('added')
		} catch {
			setState('error')
		}
	}

	return (
		<div className="ProposalCard">
			<strong>{proposalTitle(proposal.toolName)}</strong>
			<p>{summarizeProposal(proposal.toolName, proposal.input)}</p>
			{state === 'ready' ? (
				<div>
					<button className="Button Button--primary" disabled={!editor && proposal.toolName !== 'recordMistake'} onClick={() => void applyLeakedProposal()} type="button">{proposal.toolName === 'recordMistake' ? 'Save mistake' : 'Add to board'}</button>
					<button className="TextButton" onClick={() => setState('dismissed')} type="button">Dismiss</button>
				</div>
			) : <small>{state === 'added' ? 'Added to board' : state === 'dismissed' ? 'Dismissed' : 'Unable to add this proposal'}</small>}
		</div>
	)
}

function PendingLeakedProposalCard({ isPending }: { isPending: boolean }) {
	return (
		<div className="ProposalCard" aria-live="polite" role={isPending ? undefined : 'alert'}>
			<strong>{isPending ? 'Preparing board proposal…' : 'Board proposal unavailable'}</strong>
			<p>{isPending
				? 'The study partner is validating the item before showing the approval controls.'
				: 'The proposal was incomplete or invalid. Ask the study partner to try it again.'}</p>
		</div>
	)
}

function createConversationTitle(message: string) {
	const normalized = message.trim().replace(/\s+/g, ' ')
	return normalized.length > 52 ? `${normalized.slice(0, 51).trimEnd()}…` : normalized
}

function formatConversationDate(value: string) {
	return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value))
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong'
}

function readStudyModelMode(): StudyModelMode {
	const stored = getLocalStorageItem(STUDY_MODEL_STORAGE_KEY)
	return stored === 'quicker' || stored === 'smarter'
		? stored
		: DEFAULT_STUDY_MODEL_MODE
}

function readStudyMode(): StudyMode {
	return getLocalStorageItem(STUDY_MODE_STORAGE_KEY) === 'socratic' ? 'socratic' : 'direct'
}

function estimateAttachmentBytes(attachments: FileUIPart[]) {
	return attachments.reduce((total, attachment) => {
		const comma = attachment.url.indexOf(',')
		const encodedLength = comma >= 0 ? attachment.url.length - comma - 1 : attachment.url.length
		return total + Math.floor(encodedLength * 0.75)
	}, 0)
}
