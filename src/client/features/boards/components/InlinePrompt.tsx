import { apiRoutes, type CanvasAnchor } from '@agentboard/shared'
import { usePostHog } from '@posthog/react'
import { useChat } from '@ai-sdk/react'
import { IconArrowUp, IconCheck, IconPlayerStop, IconSparkles, IconX } from '@tabler/icons-react'
import {
	DefaultChatTransport,
	getToolName,
	isToolUIPart,
	type UIMessage,
} from 'ai'
import type { FormEvent, KeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'
import { TextShimmer } from '../../../components/TextShimmer'
import { captureCanvasContext } from '../../study/lib/canvasContextCapture'
import {
	readStudyMode,
	readStudyModelMode,
	readStudyReasoningEffort,
} from '../../study/lib/studyPreferences'
import {
	applyProposal,
	isStudyToolName,
	persistProposalEffect,
	recordProposedMistake,
	type ProposalEffect,
	type StudyToolName,
} from '../../study/lib/studyProposalApply'
import { proposalShortLabel, summarizeProposal } from '../../study/lib/studyProposalSummary'
import { closeInlinePrompt, useInlinePromptSession } from '../lib/inlinePrompt'

/** Staged artifacts stay translucent until the student keeps them. */
const PENDING_OPACITY = 0.45

interface InlinePreview {
	effect?: ProposalEffect
	input: unknown
	toolName: StudyToolName
}

/**
 * The cursor-side agent: cmd+I drops a composer wherever the student is working, and whatever the
 * agent proposes appears in place, staged, until it is kept or thrown away.
 */
export function InlinePrompt({ boardID }: { boardID: string }) {
	const editor = useEditor()
	const session = useInlinePromptSession()
	if (!session) return null

	return (
		<InlinePromptComposer
			anchor={session.anchor}
			boardID={boardID}
			editor={editor}
			key={session.sessionID}
			sessionID={session.sessionID}
		/>
	)
}

interface InlinePromptComposerProps {
	anchor: CanvasAnchor
	boardID: string
	editor: Editor
	sessionID: string
}

function InlinePromptComposer({ anchor, boardID, editor, sessionID }: InlinePromptComposerProps) {
	const [input, setInput] = useState('')
	const [preview, setPreview] = useState<InlinePreview | null>(null)
	const [error, setError] = useState<string | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const acceptRef = useRef<HTMLButtonElement>(null)
	const stagedToolCallIDs = useRef(new Set<string>())
	const documentClockRef = useRef<number | undefined>(undefined)
	const posthog = usePostHog()

	const transport = useMemo(() => new DefaultChatTransport<UIMessage>({
		api: apiRoutes.boardInlineAgent(boardID),
		prepareSendMessagesRequest: async ({ messages }) => {
			const canvasContext = await captureCanvasContext(boardID, editor)
			documentClockRef.current = canvasContext.documentClock
			return {
				body: {
					canvasContext: { ...canvasContext, anchor },
					inline: true,
					messages,
					modelMode: readStudyModelMode(),
					reasoningEffort: readStudyReasoningEffort(),
					studyMode: readStudyMode(),
				},
			}
		},
	}), [anchor, boardID, editor])
	const chat = useChat<UIMessage>({ id: sessionID, transport })

	// The composer is screen-sized chrome pinned to a page point: it tracks the anchor through
	// panning and zooming, but keeps its own type size rather than scaling with the canvas.
	const position = useValue('inlinePromptPosition', () => {
		const screenPoint = editor.pageToScreen(anchor)
		const viewportBounds = editor.getViewportScreenBounds()
		return { left: screenPoint.x - viewportBounds.x, top: screenPoint.y - viewportBounds.y }
	}, [anchor, editor])

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	useEffect(() => {
		if (preview) acceptRef.current?.focus()
	}, [preview])

	useEffect(() => {
		for (const message of chat.messages) {
			if (message.role !== 'assistant') continue
			for (const part of message.parts) {
				if (!isToolUIPart(part)) continue
				if (part.state !== 'input-available' && part.state !== 'output-available') continue
				const toolName = getToolName(part)
				if (!isStudyToolName(toolName) || stagedToolCallIDs.current.has(part.toolCallId)) continue
				stagedToolCallIDs.current.add(part.toolCallId)
				stageProposal(toolName, part.input)
				return
			}
		}
		// An inline request produces one artifact; later tool calls in the same turn are ignored.
	}, [chat.messages])

	function stageProposal(toolName: StudyToolName, proposal: unknown) {
		try {
			if (toolName === 'recordMistake') {
				setPreview({ input: proposal, toolName })
				return
			}
			editor.markHistoryStoppingPoint('inline proposal')
			const effect = applyProposal(editor, toolName, proposal, {
				anchor,
				documentClock: documentClockRef.current,
				select: false,
			})
			setShapeOpacity(editor, effect.shapeIDs, PENDING_OPACITY)
			setPreview({ effect, input: proposal, toolName })
		} catch (stagingError) {
			setError(getErrorMessage(stagingError))
		}
	}

	async function keepPreview() {
		if (!preview) return
		try {
			if (preview.toolName === 'recordMistake') {
				await recordProposedMistake(boardID, preview.input)
			} else if (preview.effect) {
				setShapeOpacity(editor, preview.effect.shapeIDs, 1)
				editor.setSelectedShapes(preview.effect.shapeIDs)
				await persistProposalEffect(boardID, preview.effect)
			}
			closeInlinePrompt()
		} catch (keepError) {
			setError(getErrorMessage(keepError))
		}
	}

	function discardPreview() {
		if (preview?.effect?.shapeIDs.length) editor.deleteShapes(preview.effect.shapeIDs)
		setPreview(null)
	}

	function dismiss() {
		void chat.stop()
		discardPreview()
		closeInlinePrompt()
		editor.focus()
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const text = input.trim()
		if (!text || chat.status !== 'ready') return
		posthog?.capture('inline_prompt_submitted')
		setInput('')
		setError(null)
		// Asking again replaces the staged artifact rather than stacking a second one beside it.
		discardPreview()
		void chat.sendMessage({ text })
	}

	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		// tldraw listens for keys on the document; the composer owns them while it is open.
		event.stopPropagation()
		if (event.key === 'Escape') {
			event.preventDefault()
			dismiss()
		}
	}

	const isWorking = chat.status === 'submitted' || chat.status === 'streaming'
	const answer = chat.messages
		.filter((message) => message.role === 'assistant')
		.flatMap((message) => message.parts)
		.flatMap((part) => (part.type === 'text' ? [part.text] : []))
		.join('')
		.trim()

	return (
		<div className="InlinePrompt" onKeyDown={handleKeyDown} style={position}>
			<form className="InlinePrompt-composer" onSubmit={handleSubmit}>
				<IconSparkles aria-hidden="true" className="InlinePrompt-mark" size={15} stroke={1.8} />
				<input
					aria-label="Ask the study agent here"
					autoComplete="off"
					onChange={(event) => setInput(event.target.value)}
					placeholder={preview ? 'Ask again to replace it…' : 'Ask, or describe what to add here…'}
					ref={inputRef}
					type="text"
					value={input}
				/>
				{isWorking ? (
					<button aria-label="Stop" onClick={() => void chat.stop()} title="Stop" type="button">
						<IconPlayerStop aria-hidden="true" size={14} stroke={2} />
					</button>
				) : (
					<button aria-label="Send" disabled={!input.trim()} title="Send" type="submit">
						<IconArrowUp aria-hidden="true" size={15} stroke={2} />
					</button>
				)}
				<button aria-label="Close" className="InlinePrompt-close" onClick={dismiss} title="Close" type="button">
					<IconX aria-hidden="true" size={14} stroke={1.8} />
				</button>
			</form>

			{isWorking && !preview ? (
				<p className="InlinePrompt-status"><TextShimmer>Working at your cursor…</TextShimmer></p>
			) : null}

			{answer && !preview ? <p className="InlinePrompt-answer">{answer}</p> : null}

			{preview ? (
				<div className="InlinePrompt-preview">
					<div className="InlinePrompt-previewText">
						<strong>{proposalShortLabel(preview.toolName)}</strong>
						<span>{summarizeProposal(preview.toolName, preview.input)}</span>
					</div>
					<div className="InlinePrompt-previewActions">
						<button className="Button Button--primary" onClick={() => void keepPreview()} ref={acceptRef} type="button">
							<IconCheck aria-hidden="true" size={14} stroke={2} /> Keep
						</button>
						<button className="TextButton" onClick={dismiss} type="button">Discard</button>
					</div>
				</div>
			) : null}

			{error ? <p className="InlinePrompt-error" role="alert">{error}</p> : null}
			{chat.error && !error ? (
				<p className="InlinePrompt-error" role="alert">{chat.error.message}</p>
			) : null}
		</div>
	)
}

function setShapeOpacity(editor: Editor, shapeIDs: readonly TLShapeId[], opacity: number) {
	const updates = shapeIDs.flatMap((id) => {
		const shape = editor.getShape(id)
		return shape ? [{ id, type: shape.type, opacity }] : []
	})
	if (updates.length) editor.updateShapes(updates)
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong'
}
