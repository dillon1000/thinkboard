import {
	CONCEPT_MAP_SHAPE_TYPE,
	FLASHCARD_CANVAS_HEIGHT,
	FLASHCARD_CANVAS_WIDTH,
	FLASHCARD_SHAPE_TYPE,
	QUIZ_SHAPE_TYPE,
	REVIEW_SHAPE_TYPE,
	WALKTHROUGH_SHAPE_TYPE,
	PDF_PAGE_SHAPE_TYPE,
	TEACH_BACK_SHAPE_TYPE,
	LECTURE_SHAPE_TYPE,
	activeRecallGradeResponseSchema,
	apiRoutes,
	conceptMapShapeProps,
	flashcardShapeMigrations,
	flashcardShapeProps,
	quizShapeProps,
	reviewShapeProps,
	walkthroughShapeProps,
	type ConceptMapShapeProps,
	type FlashcardShapeProps,
	type QuizShapeProps,
	type ReviewShapeProps,
	type WalkthroughShapeProps,
	pdfPageShapeMigrations,
	pdfPageShapeProps,
	pdfSourceReferenceSchema,
	teachBackShapeProps,
	lectureShapeProps,
	lectureSchema,
	type Lecture,
	type PDFPageShapeProps,
	type PDFSourceReference,
	type TeachBackShapeProps,
	type LectureShapeProps,
} from '@agentboard/shared'
import {
	IconCards,
	IconDownload,
	IconFileText,
	IconHeadphones,
	IconMessageCircleCheck,
	IconPencil,
	IconQuestionMark,
	IconSchool,
	IconX,
} from '@tabler/icons-react'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router'
import { Streamdown } from 'streamdown'
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	type TLShape,
	useEditor,
} from 'tldraw'
import { z } from 'zod'
import { FlashcardAnswerPanel } from '../components/FlashcardAnswerPanel'
import { PDFPageInteractiveLayer } from '../components/PDFPageInteractiveLayer'
import { readBoardFlashcardDirectReveal } from '../lib/boardFlashcardPreferences'
import { studyMarkdownPlugins } from '../lib/studyMath'
import { focusPDFCitation } from '../lib/pdfCitation'
import { useBoardChrome } from '../../boards/lib/BoardChromeProvider'
import { apiRequest } from '../../../lib/api'
import { captureCanvasContext } from '../lib/canvasContextCapture'
import '../components/activeRecall.css'

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		[FLASHCARD_SHAPE_TYPE]: FlashcardShapeProps
		[CONCEPT_MAP_SHAPE_TYPE]: ConceptMapShapeProps
		[QUIZ_SHAPE_TYPE]: QuizShapeProps
		[REVIEW_SHAPE_TYPE]: ReviewShapeProps
		[WALKTHROUGH_SHAPE_TYPE]: WalkthroughShapeProps
		[PDF_PAGE_SHAPE_TYPE]: PDFPageShapeProps
		[TEACH_BACK_SHAPE_TYPE]: TeachBackShapeProps
		[LECTURE_SHAPE_TYPE]: LectureShapeProps
	}
}

export type FlashcardShape = TLShape<typeof FLASHCARD_SHAPE_TYPE>
export type ConceptMapShape = TLShape<typeof CONCEPT_MAP_SHAPE_TYPE>
export type QuizShape = TLShape<typeof QUIZ_SHAPE_TYPE>
export type ReviewShape = TLShape<typeof REVIEW_SHAPE_TYPE>
export type WalkthroughShape = TLShape<typeof WALKTHROUGH_SHAPE_TYPE>
export type PDFPageShape = TLShape<typeof PDF_PAGE_SHAPE_TYPE>
export type TeachBackShape = TLShape<typeof TEACH_BACK_SHAPE_TYPE>
export type LectureShape = TLShape<typeof LECTURE_SHAPE_TYPE>

const STUDY_SHAPE_HEADING_HEIGHT = 30

export const canvasInteractionHandlers = {
	onPointerDown: stopCanvasInteraction,
	onTouchEnd: stopCanvasInteraction,
	onTouchStart: stopCanvasInteraction,
}

function stopCanvasInteraction(event: { stopPropagation: () => void }) {
	event.stopPropagation()
}

type AutoFitShape = FlashcardShape | QuizShape | ReviewShape | WalkthroughShape | TeachBackShape

// Keeps the shape's height matched to its rendered content: the returned ref
// goes on an inner wrapper whose natural height (content + padding) is
// measured, so the wrapper must not be stretched by its container.
function useAutoFitHeight(shape: AutoFitShape, minHeight: number) {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)
	useLayoutEffect(() => {
		const element = ref.current
		if (!element) return
		const fit = () => {
			const desired = Math.max(minHeight, STUDY_SHAPE_HEADING_HEIGHT + element.offsetHeight)
			if (Math.abs(desired - shape.props.h) <= 1) return
			editor.run(
				() => {
					editor.updateShape({ id: shape.id, type: shape.type, props: { h: desired } })
				},
				{ history: 'ignore' }
			)
		}
		fit()
		const observer = new ResizeObserver(fit)
		observer.observe(element)
		return () => observer.disconnect()
	})
	return ref
}

export class FlashcardShapeUtil extends BaseBoxShapeUtil<FlashcardShape> {
	static override type = FLASHCARD_SHAPE_TYPE
	static override migrations = flashcardShapeMigrations
	static override props = flashcardShapeProps

	override canResize() {
		return true
	}

	override isAspectRatioLocked() {
		return false
	}

	override getDefaultProps(): FlashcardShape['props'] {
		return {
			w: FLASHCARD_CANVAS_WIDTH,
			h: FLASHCARD_CANVAS_HEIGHT,
			front: 'Question',
			back: 'Answer',
			alternateAnswers: [],
			revealed: false,
			schemaVersion: 1,
		}
	}

	override getText(shape: FlashcardShape) {
		return `Flashcard question: ${shape.props.front}\nAnswer: ${shape.props.back}`
	}

	override component(shape: FlashcardShape) {
		return <FlashcardComponent shape={shape} />
	}

	override getIndicatorPath(shape: FlashcardShape) {
		return getBoxIndicator(shape.props.w, shape.props.h)
	}
}

function FlashcardComponent({ shape }: { shape: FlashcardShape }) {
	const chrome = useBoardChrome()
	const [isEditing, setIsEditing] = useState(false)
	const [isAnswering, setIsAnswering] = useState(false)
	const directReveal = readBoardFlashcardDirectReveal()
	// Direct reveal stays private, so one student's setting cannot expose an answer to collaborators.
	const [isRevealed, setIsRevealed] = useState(false)
	const fitRef = useAutoFitHeight(shape, FLASHCARD_CANVAS_HEIGHT)

	function openFlashcard() {
		if (directReveal) {
			setIsRevealed((current) => !current)
			return
		}
		setIsAnswering(true)
	}

	return (
		<HTMLContainer className="StudyShape StudyShape--flashcard">
			<div className="StudyShape-heading">
				<span>{isRevealed ? 'Answer' : 'Question'}</span>
				<div>
					{chrome.role !== 'viewer' ? (
						<button
							aria-label="Edit flashcard"
							onClick={() => setIsEditing(true)}
							title="Edit flashcard"
							type="button"
							{...canvasInteractionHandlers}
						>
							<IconPencil aria-hidden="true" size={13} stroke={1.8} />
						</button>
					) : null}
					<IconCards aria-hidden="true" size={15} stroke={1.8} />
				</div>
			</div>
			<div className="Flashcard-face" ref={fitRef} {...canvasInteractionHandlers}>
				<div
					aria-label={directReveal
						? isRevealed ? 'Show flashcard question' : 'Reveal flashcard answer'
						: 'Answer flashcard'}
					className={`Flashcard-trigger${isRevealed ? ' is-revealed' : ''}`}
					onClick={openFlashcard}
					onKeyDown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return
						event.preventDefault()
						openFlashcard()
					}}
					role="button"
					tabIndex={0}
				>
					<StudyMath className="Flashcard-copy">
						{isRevealed ? shape.props.back : shape.props.front}
					</StudyMath>
					<span>{directReveal
						? isRevealed ? 'Click for question' : 'Click to reveal'
						: 'Click to answer'}</span>
				</div>
				<StudySources shape={shape} />
			</div>
			{isAnswering ? (
				<FlashcardAnswerDialog
					onClose={() => setIsAnswering(false)}
					shape={shape}
				/>
			) : null}
			{isEditing ? <FlashcardEditorDialog onClose={() => setIsEditing(false)} shape={shape} /> : null}
		</HTMLContainer>
	)
}

function FlashcardAnswerDialog({
	onClose,
	shape,
}: {
	onClose: () => void
	shape: FlashcardShape
}) {
	const chrome = useBoardChrome()

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	return createPortal(
		<div
			className="FlashcardAnswerDialog-backdrop"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
			role="presentation"
			{...canvasInteractionHandlers}
		>
			<section
				aria-labelledby="flashcard-answer-dialog-title"
				aria-modal="true"
				className="FlashcardAnswerDialog"
				role="dialog"
			>
				<header>
					<div>
						<small>Flashcard</small>
						<h2 id="flashcard-answer-dialog-title">Answer this question</h2>
					</div>
					<button aria-label="Close answer dialog" onClick={onClose} type="button">
						<IconX aria-hidden="true" size={17} stroke={1.8} />
					</button>
				</header>
				<StudyMath className="FlashcardAnswerDialog-question">{shape.props.front}</StudyMath>
				<FlashcardAnswerPanel
					onCompleted={onClose}
					source={{
						alternateAnswers: shape.props.alternateAnswers,
						back: shape.props.back,
						boardID: chrome.boardID,
						front: shape.props.front,
						kind: 'canvas',
						shapeID: shape.id,
					}}
				/>
			</section>
		</div>,
		document.body
	)
}

function FlashcardEditorDialog({
	onClose,
	shape,
}: {
	onClose: () => void
	shape: FlashcardShape
}) {
	const editor = useEditor()
	const [front, setFront] = useState(shape.props.front)
	const [back, setBack] = useState(shape.props.back)
	const [alternateAnswers, setAlternateAnswers] = useState(() => [
		...shape.props.alternateAnswers.slice(0, 5),
		...Array.from({ length: Math.max(0, 5 - shape.props.alternateAnswers.length) }, () => ''),
	])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [onClose])

	function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const nextFront = front.trim()
		const nextBack = back.trim()
		if (!nextFront || !nextBack) return
		editor.updateShape<FlashcardShape>({
			id: shape.id,
			type: FLASHCARD_SHAPE_TYPE,
			props: {
				alternateAnswers: alternateAnswers.map((answer) => answer.trim()).filter(Boolean),
				back: nextBack,
				front: nextFront,
				revealed: false,
			},
		})
		onClose()
	}

	return createPortal(
		<div
			className="FlashcardEditor-backdrop"
			onPointerDown={(event) => {
				if (event.currentTarget === event.target) onClose()
			}}
		>
			<form
				aria-labelledby="flashcard-editor-title"
				aria-modal="true"
				className="FlashcardEditor"
				onSubmit={save}
				role="dialog"
			>
				<header>
					<div>
						<p className="Eyebrow">Study card</p>
						<h2 id="flashcard-editor-title">Edit flashcard</h2>
					</div>
					<button aria-label="Close flashcard editor" onClick={onClose} type="button">
						<IconX aria-hidden="true" size={17} />
					</button>
				</header>
				<label>
					<span>Question</span>
					<textarea autoFocus maxLength={300} onChange={(event) => setFront(event.target.value)} rows={3} value={front} />
				</label>
				<label>
					<span>Primary answer</span>
					<textarea maxLength={600} onChange={(event) => setBack(event.target.value)} rows={4} value={back} />
				</label>
				<fieldset>
					<legend>Alternate answers</legend>
					<p>Optional concise answers that should also count as correct.</p>
					{alternateAnswers.map((answer, index) => (
						<input
							aria-label={`Alternate answer ${index + 1}`}
							key={index}
							maxLength={300}
							onChange={(event) => setAlternateAnswers((current) => current.map((value, answerIndex) => (
								answerIndex === index ? event.target.value : value
							)))}
							placeholder={`Alternate answer ${index + 1}`}
							value={answer}
						/>
					))}
				</fieldset>
				<footer>
					<button onClick={onClose} type="button">Cancel</button>
					<button className="Button Button--primary" disabled={!front.trim() || !back.trim()} type="submit">Save card</button>
				</footer>
			</form>
		</div>,
		document.body
	)
}

export class QuizShapeUtil extends BaseBoxShapeUtil<QuizShape> {
	static override type = QUIZ_SHAPE_TYPE
	static override props = quizShapeProps

	override canResize() {
		return true
	}

	override isAspectRatioLocked() {
		return false
	}

	override getDefaultProps(): QuizShape['props'] {
		return {
			w: 360,
			h: 330,
			question: 'Question',
			options: ['Option A', 'Option B'],
			correctIndex: 0,
			explanation: 'Explanation',
			selectedIndex: -1,
			showResult: false,
			schemaVersion: 1,
		}
	}

	override getText(shape: QuizShape) {
		return `Quiz: ${shape.props.question}\n${shape.props.options.join('\n')}\nCorrect answer: ${shape.props.options[shape.props.correctIndex]}\nExplanation: ${shape.props.explanation}`
	}

	override component(shape: QuizShape) {
		return <QuizComponent shape={shape} />
	}

	override getIndicatorPath(shape: QuizShape) {
		return getBoxIndicator(shape.props.w, shape.props.h)
	}
}

function QuizComponent({ shape }: { shape: QuizShape }) {
	const editor = useEditor()
	const fitRef = useAutoFitHeight(shape, 120)
	const isCorrect = shape.props.selectedIndex === shape.props.correctIndex

	function chooseAnswer(selectedIndex: number) {
		editor.updateShape<QuizShape>({
			id: shape.id,
			type: QUIZ_SHAPE_TYPE,
			props: { selectedIndex, showResult: true },
		})
	}

	return (
		<HTMLContainer className="StudyShape StudyShape--quiz">
			<div className="StudyShape-heading"><span>Quick check</span><IconQuestionMark aria-hidden="true" size={15} stroke={2} /></div>
			<div className="Quiz-content">
				<div className="Quiz-inner" ref={fitRef}>
					<StudyMath className="Quiz-question">{shape.props.question}</StudyMath>
					<div className="Quiz-options">
						{shape.props.options.map((option, index) => {
							const isSelected = shape.props.selectedIndex === index
							const isAnswer = shape.props.showResult && shape.props.correctIndex === index
							return (
								<button
									className={isAnswer ? 'is-answer' : isSelected ? 'is-selected' : undefined}
									disabled={shape.props.showResult}
									key={`${index}-${option}`}
									onClick={() => chooseAnswer(index)}
									{...canvasInteractionHandlers}
									type="button"
								>
									<span>{String.fromCharCode(65 + index)}</span>
									<StudyMath className="Quiz-optionText">{option}</StudyMath>
								</button>
							)
						})}
					</div>
						{shape.props.showResult ? (
						<div className={isCorrect ? 'Quiz-result is-correct' : 'Quiz-result'}>
							<strong>{isCorrect ? 'That’s right.' : 'Not quite yet.'}</strong>
							<StudyMath className="Quiz-explanation">{shape.props.explanation}</StudyMath>
							<button
								onClick={() => editor.updateShape<QuizShape>({ id: shape.id, type: QUIZ_SHAPE_TYPE, props: { selectedIndex: -1, showResult: false } })}
								{...canvasInteractionHandlers}
								type="button"
							>
								Try again
							</button>
						</div>
						) : null}
						<StudySources shape={shape} />
					</div>
			</div>
		</HTMLContainer>
	)
}

export class ReviewShapeUtil extends BaseBoxShapeUtil<ReviewShape> {
	static override type = REVIEW_SHAPE_TYPE
	static override props = reviewShapeProps

	override canResize() {
		return true
	}

	override isAspectRatioLocked() {
		return false
	}

	override getDefaultProps(): ReviewShape['props'] {
		return {
			w: 310,
			h: 200,
			title: 'Review note',
			body: 'Take another look at this step.',
			severity: 'note',
			resolved: false,
			schemaVersion: 1,
		}
	}

	override getText(shape: ReviewShape) {
		return `Tutor review (${shape.props.severity}): ${shape.props.title}\n${shape.props.body}`
	}

	override component(shape: ReviewShape) {
		return <ReviewComponent shape={shape} />
	}

	override getIndicatorPath(shape: ReviewShape) {
		return getBoxIndicator(shape.props.w, shape.props.h)
	}
}

function ReviewComponent({ shape }: { shape: ReviewShape }) {
	const editor = useEditor()
	const fitRef = useAutoFitHeight(shape, 110)

	return (
		<HTMLContainer className={`StudyShape StudyShape--review StudyShape--${shape.props.severity}${shape.props.resolved ? ' is-resolved' : ''}`}>
			<div className="StudyShape-heading"><span>{shape.props.severity}</span><IconMessageCircleCheck aria-hidden="true" size={15} stroke={1.8} /></div>
			<div className="Review-content">
				<div className="Review-inner" ref={fitRef}>
					<StudyMath className="Review-title">{shape.props.title}</StudyMath>
					<StudyMath className="Review-body">{shape.props.body}</StudyMath>
					<button
						onClick={() => editor.updateShape<ReviewShape>({ id: shape.id, type: REVIEW_SHAPE_TYPE, props: { resolved: !shape.props.resolved } })}
						{...canvasInteractionHandlers}
						type="button"
					>
						{shape.props.resolved ? 'Reopen' : 'Mark reviewed'}
					</button>
				</div>
			</div>
		</HTMLContainer>
	)
}

export class WalkthroughShapeUtil extends BaseBoxShapeUtil<WalkthroughShape> {
	static override type = WALKTHROUGH_SHAPE_TYPE
	static override props = walkthroughShapeProps

	override canResize() { return true }
	override isAspectRatioLocked() { return false }
	override getDefaultProps(): WalkthroughShape['props'] {
		return {
			w: 420,
			h: 330,
			title: 'Worked example',
			steps: [
				{ prompt: 'Try the first step.', explanation: 'Work through the first transformation.' },
				{ prompt: 'What comes next?', explanation: 'Complete the next transformation.' },
			],
			currentStep: 0,
			revealed: false,
			schemaVersion: 1,
		}
	}
	override getText(shape: WalkthroughShape) {
		return `Worked example: ${shape.props.title}\n${shape.props.steps.map((step, index) => `Step ${index + 1}: ${step.prompt}\n${step.explanation}`).join('\n')}`
	}
	override component(shape: WalkthroughShape) { return <WalkthroughComponent shape={shape} /> }
	override getIndicatorPath(shape: WalkthroughShape) { return getBoxIndicator(shape.props.w, shape.props.h) }
}

function WalkthroughComponent({ shape }: { shape: WalkthroughShape }) {
	const editor = useEditor()
	const fitRef = useAutoFitHeight(shape, 140)
	const step = shape.props.steps[shape.props.currentStep]
	const isLast = shape.props.currentStep === shape.props.steps.length - 1
	function update(props: Partial<WalkthroughShape['props']>) {
		editor.updateShape<WalkthroughShape>({ id: shape.id, type: WALKTHROUGH_SHAPE_TYPE, props })
	}
	return (
		<HTMLContainer className="StudyShape StudyShape--walkthrough">
			<div className="StudyShape-heading"><span>Worked example</span><span>{shape.props.currentStep + 1}/{shape.props.steps.length}</span></div>
			<div className="Walkthrough-content">
				<div className="Walkthrough-inner" ref={fitRef}>
					<StudyMath className="Walkthrough-title">{shape.props.title}</StudyMath>
					<StudyMath className="Walkthrough-prompt">{step?.prompt ?? ''}</StudyMath>
					{shape.props.revealed ? <StudyMath className="Walkthrough-explanation">{step?.explanation ?? ''}</StudyMath> : <p className="Walkthrough-hint">Try this step on your own before revealing the walkthrough.</p>}
					<button {...canvasInteractionHandlers} onClick={() => shape.props.revealed
						? update({ currentStep: isLast ? 0 : shape.props.currentStep + 1, revealed: false })
						: update({ revealed: true })} type="button">
						{shape.props.revealed ? isLast ? 'Start over' : 'Next step' : 'Reveal this step'}
					</button>
				</div>
			</div>
		</HTMLContainer>
	)
}

export class ConceptMapShapeUtil extends BaseBoxShapeUtil<ConceptMapShape> {
	static override type = CONCEPT_MAP_SHAPE_TYPE
	static override props = conceptMapShapeProps
	override canResize() { return true }
	override isAspectRatioLocked() { return false }
	override getDefaultProps(): ConceptMapShape['props'] {
		return {
			w: 560,
			h: 390,
			title: 'Concept map',
			nodes: [{ id: 'main', label: 'Main idea', x: 0.5, y: 0.5 }, { id: 'detail', label: 'Detail', x: 0.8, y: 0.5 }],
			edges: [{ from: 'main', to: 'detail', label: 'connects to' }],
			schemaVersion: 1,
		}
	}
	override getText(shape: ConceptMapShape) {
		return `Concept map: ${shape.props.title}\nNodes: ${shape.props.nodes.map(({ label }) => label).join(', ')}\nRelationships: ${shape.props.edges.map((edge) => `${edge.from} ${edge.label} ${edge.to}`).join('; ')}`
	}
	override component(shape: ConceptMapShape) { return <ConceptMapComponent shape={shape} /> }
	override getIndicatorPath(shape: ConceptMapShape) { return getBoxIndicator(shape.props.w, shape.props.h) }
}

export class TeachBackShapeUtil extends BaseBoxShapeUtil<TeachBackShape> {
	static override type = TEACH_BACK_SHAPE_TYPE
	static override props = teachBackShapeProps
	override canResize() { return true }
	override isAspectRatioLocked() { return false }
	override getDefaultProps(): TeachBackShape['props'] {
		return {
			w: 430,
			h: 500,
			topic: 'Explain this concept in your own words',
			sourceText: '',
			response: '',
			feedback: '',
			score: 0,
			verdict: 'ungraded',
			schemaVersion: 1,
		}
	}
	override getText(shape: TeachBackShape) {
		return [
			`Teach back: ${shape.props.topic}`,
			`Source: ${shape.props.sourceText}`,
			`Student explanation: ${shape.props.response}`,
			shape.props.feedback ? `Feedback: ${shape.props.feedback}` : '',
		].filter(Boolean).join('\n')
	}
	override component(shape: TeachBackShape) {
		return <TeachBackComponent shape={shape} />
	}
	override getIndicatorPath(shape: TeachBackShape) {
		return getBoxIndicator(shape.props.w, shape.props.h)
	}
}

export class LectureShapeUtil extends BaseBoxShapeUtil<LectureShape> {
	static override type = LECTURE_SHAPE_TYPE
	static override props = lectureShapeProps
	override canResize() { return true }
	override isAspectRatioLocked() { return false }
	override getDefaultProps(): LectureShape['props'] {
		return {
			w: 520,
			h: 500,
			lectureID: '',
			title: 'Recorded lecture',
			schemaVersion: 1,
		}
	}
	override getText(shape: LectureShape) {
		return `Recorded lecture: ${shape.props.title}`
	}
	override component(shape: LectureShape) {
		return <LectureComponent shape={shape} />
	}
	override getIndicatorPath(shape: LectureShape) {
		return getBoxIndicator(shape.props.w, shape.props.h)
	}
}

function LectureComponent({ shape }: { shape: LectureShape }) {
	const chrome = useBoardChrome()
	const audioRef = useRef<HTMLAudioElement>(null)
	const [lecture, setLecture] = useState<Lecture | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let timer: number | undefined
		let stopped = false
		const load = async () => {
			try {
				const response = await apiRequest(
					apiRoutes.boardLecture(chrome.boardID, shape.props.lectureID),
					undefined,
					z.object({ lecture: lectureSchema })
				)
				if (stopped) return
				setLecture(response.lecture)
				setError(null)
				if (response.lecture.status === 'processing') {
					timer = window.setTimeout(() => void load(), 3_000)
				}
			} catch (loadError) {
				if (!stopped) setError(loadError instanceof Error
					? loadError.message
					: 'Unable to load this lecture')
			}
		}
		void load()
		return () => {
			stopped = true
			if (timer) window.clearTimeout(timer)
		}
	}, [chrome.boardID, shape.props.lectureID])

	useEffect(() => {
		const seek = (event: Event) => {
			if (!(event instanceof CustomEvent)) return
			const detail = z.object({ lectureID: z.string(), startSecond: z.number() })
				.safeParse(event.detail)
			if (!detail.success || detail.data.lectureID !== shape.props.lectureID || !audioRef.current) return
			audioRef.current.currentTime = detail.data.startSecond
			void audioRef.current.play().catch(() => undefined)
		}
		window.addEventListener('agentboard:lecture-seek', seek)
		return () => window.removeEventListener('agentboard:lecture-seek', seek)
	}, [shape.props.lectureID])

	function seekTo(startSecond: number) {
		if (!audioRef.current) return
		audioRef.current.currentTime = startSecond
		void audioRef.current.play().catch(() => undefined)
	}

	return (
		<HTMLContainer className="StudyShape StudyShape--lecture">
			<div className="StudyShape-heading">
				<span>Recorded lecture</span>
				<IconHeadphones aria-hidden="true" size={15} />
			</div>
			<div className="LectureShape-content" {...canvasInteractionHandlers}>
				<strong>{shape.props.title}</strong>
				<audio
					controls
					preload="metadata"
					ref={audioRef}
					src={apiRoutes.boardLectureAudio(chrome.boardID, shape.props.lectureID)}
				/>
				{lecture?.status === 'processing' ? (
					<p className="LectureShape-status">Transcribing and indexing this recording…</p>
				) : null}
				{lecture?.status === 'failed' ? (
					<p className="FormError">{lecture.failureReason ?? 'Transcription failed'}</p>
				) : null}
				{error ? <p className="FormError">{error}</p> : null}
				{lecture?.status === 'ready' ? (
					<div className="LectureShape-transcript">
						{lecture.segments.map((segment, index) => (
							<button
								key={`${index}-${segment.start}`}
								onClick={() => seekTo(segment.start)}
								type="button"
							>
								<time>{formatLectureTimestamp(segment.start)}</time>
								<span>{segment.text}</span>
							</button>
						))}
					</div>
				) : null}
			</div>
		</HTMLContainer>
	)
}

function formatLectureTimestamp(value: number) {
	const seconds = Math.max(0, Math.floor(value))
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function TeachBackComponent({ shape }: { shape: TeachBackShape }) {
	const editor = useEditor()
	const chrome = useBoardChrome()
	const fitRef = useAutoFitHeight(shape, 360)
	const [isGrading, setIsGrading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	function update(props: Partial<TeachBackShape['props']>) {
		editor.updateShape<TeachBackShape>({
			id: shape.id,
			type: TEACH_BACK_SHAPE_TYPE,
			props,
		})
	}

	async function grade(kind: 'ink' | 'typed') {
		setIsGrading(true)
		setError(null)
		const previousSelection = editor.getSelectedShapeIds()
		try {
			const inkShapeIDs = previousSelection.filter((shapeID) => shapeID !== shape.id)
			if (kind === 'ink' && !inkShapeIDs.length) {
				throw new Error('Select the ink shapes that contain your explanation first')
			}
			if (!shape.props.sourceText.trim()) {
				throw new Error('Add source material before grading this explanation')
			}
			if (kind === 'ink') editor.setSelectedShapes(inkShapeIDs)
			const canvasContext = kind === 'ink'
				? await captureCanvasContext(chrome.boardID, editor)
				: {
						boardID: chrome.boardID,
						relatedShapes: [],
						relationships: [],
						selection: [],
					}
			if (kind === 'ink') editor.setSelectedShapes(previousSelection)
			const result = await apiRequest(
				apiRoutes.boardActiveRecallGrade(chrome.boardID),
				{
					body: JSON.stringify({
						canvasContext,
						explanation: kind === 'typed' ? shape.props.response : '',
						mode: 'teach-back',
						sourceText: shape.props.sourceText,
						topic: shape.props.topic,
					}),
					method: 'POST',
				},
				activeRecallGradeResponseSchema
			)
			update({
				feedback: `${result.summary}\n\nNext: ${result.nextStep}`,
				score: result.score,
				verdict: result.verdict,
			})
		} catch (gradeError) {
			editor.setSelectedShapes(previousSelection)
			setError(gradeError instanceof Error ? gradeError.message : 'Unable to grade this explanation')
		} finally {
			setIsGrading(false)
		}
	}

	return (
		<HTMLContainer className="StudyShape StudyShape--teachBack">
			<div className="StudyShape-heading">
				<span>Teach back</span>
				<span>{shape.props.verdict === 'ungraded' ? 'Feynman check' : `${shape.props.score}%`}</span>
			</div>
			<div className="TeachBack-content" ref={fitRef} {...canvasInteractionHandlers}>
				<label>
					<span>Concept</span>
					<input
						disabled={chrome.role === 'viewer'}
						maxLength={300}
						onChange={(event) => update({
							feedback: '',
							topic: event.target.value,
							verdict: 'ungraded',
						})}
						placeholder="What are you explaining?"
						value={shape.props.topic}
					/>
				</label>
				<label>
					<span>Source material</span>
					<textarea
						disabled={chrome.role === 'viewer'}
						maxLength={24_000}
						onChange={(event) => update({
							feedback: '',
							sourceText: event.target.value,
							verdict: 'ungraded',
						})}
						placeholder="Paste the source or create this shape while PDF text is selected."
						rows={3}
						value={shape.props.sourceText}
					/>
				</label>
				<label>
					<span>Your explanation</span>
					<textarea
						disabled={chrome.role === 'viewer'}
						maxLength={12_000}
						onChange={(event) => update({
							feedback: '',
							response: event.target.value,
							verdict: 'ungraded',
						})}
						placeholder="Explain it simply, without copying the source."
						rows={5}
						value={shape.props.response}
					/>
				</label>
				{error ? <p className="FormError" role="alert">{error}</p> : null}
				{shape.props.feedback ? (
					<div className={`TeachBack-feedback is-${shape.props.verdict}`}>
						<strong>{formatTeachBackVerdict(shape.props.verdict)} · {shape.props.score}%</strong>
						<StudyMath className="TeachBack-feedbackText">{shape.props.feedback}</StudyMath>
					</div>
				) : null}
				{chrome.role !== 'viewer' ? (
					<div className="TeachBack-actions">
						<button
							disabled={isGrading || !shape.props.response.trim()}
							onClick={() => void grade('typed')}
							type="button"
						>
							<IconSchool aria-hidden="true" size={14} />
							{isGrading ? 'Grading…' : 'Grade typed response'}
						</button>
						<button
							disabled={isGrading}
							onClick={() => void grade('ink')}
							type="button"
						>
							Grade selected ink
						</button>
					</div>
				) : null}
			</div>
		</HTMLContainer>
	)
}

function formatTeachBackVerdict(verdict: TeachBackShape['props']['verdict']) {
	if (verdict === 'correct') return 'Clear explanation'
	if (verdict === 'partial') return 'Partly complete'
	if (verdict === 'incorrect') return 'Needs correction'
	if (verdict === 'unclear') return 'Needs more evidence'
	return 'Not graded'
}

export class PDFPageShapeUtil extends BaseBoxShapeUtil<PDFPageShape> {
	static override type = PDF_PAGE_SHAPE_TYPE
	static override props = pdfPageShapeProps
	static override migrations = pdfPageShapeMigrations

	override canEdit() { return false }
	override canResize() { return true }
	override canCrop() { return false }
	override isAspectRatioLocked() { return true }
	override getDefaultProps(): PDFPageShape['props'] {
		return { documentId: '', pageNumber: 1, renderVersion: 1, w: 612, h: 792 }
	}
	override component(shape: PDFPageShape) { return <PDFPageComponent shape={shape} /> }
	override getIndicatorPath(shape: PDFPageShape) { return getBoxIndicator(shape.props.w, shape.props.h) }
}

function PDFPageComponent({ shape }: { shape: PDFPageShape }) {
	const { boardID = '' } = useParams<{ boardID: string }>()
	const originalPDFURL = apiRoutes.boardDocumentOriginal(boardID, shape.props.documentId)
	const downloadPDFURL = `${originalPDFURL}?download=1`
	return (
		<HTMLContainer className="PDFPageShape">
			<img
				alt={`PDF page ${shape.props.pageNumber}`}
				draggable={false}
				loading="lazy"
				src={`${apiRoutes.boardDocumentPage(boardID, shape.props.documentId, shape.props.pageNumber)}?v=${shape.props.renderVersion}`}
			/>
			{shape.props.pageNumber === 1 ? (
				<a
					{...canvasInteractionHandlers}
					aria-label="Download PDF"
					className="PDFPageDownload"
					download
					href={downloadPDFURL}
					onClick={stopCanvasInteraction}
					title="Download original PDF"
				>
					<IconDownload aria-hidden="true" size={14} stroke={1.8} />
					<span>Download PDF</span>
				</a>
			) : null}
			<PDFPageInteractiveLayer
				boardID={boardID}
				documentID={shape.props.documentId}
				height={shape.props.h}
				pageNumber={shape.props.pageNumber}
				shapeID={shape.id}
				width={shape.props.w}
			/>
		</HTMLContainer>
	)
}

function ConceptMapComponent({ shape }: { shape: ConceptMapShape }) {
	const nodeByID = new Map(shape.props.nodes.map((node) => [node.id, node]))
	return (
		<HTMLContainer className="StudyShape StudyShape--conceptMap">
			<div className="StudyShape-heading"><span>Concept map</span><span>{shape.props.nodes.length} ideas</span></div>
			<div className="ConceptMap-content">
				<StudyMath className="ConceptMap-title">{shape.props.title}</StudyMath>
				<svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
					{shape.props.edges.map((edge, index) => {
						const from = nodeByID.get(edge.from)
						const to = nodeByID.get(edge.to)
						return from && to ? <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x * 100} y1={from.y * 100} x2={to.x * 100} y2={to.y * 100} /> : null
					})}
				</svg>
				{shape.props.nodes.map((node) => <div className="ConceptMap-node" key={node.id} style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}><StudyMath className="ConceptMap-nodeLabel">{node.label}</StudyMath></div>)}
					{shape.props.edges.filter(({ label }) => label).map((edge, index) => {
					const from = nodeByID.get(edge.from)
					const to = nodeByID.get(edge.to)
					return from && to ? <small className="ConceptMap-edgeLabel" key={`${edge.from}-${edge.to}-label-${index}`} style={{ left: `${((from.x + to.x) / 2) * 100}%`, top: `${((from.y + to.y) / 2) * 100}%` }}>{edge.label}</small> : null
					})}
					<StudySources overlay shape={shape} />
				</div>
		</HTMLContainer>
	)
}

function StudySources({ overlay = false, shape }: { overlay?: boolean; shape: TLShape }) {
	const editor = useEditor()
	const sources = readStudySources(shape)
	if (!sources.length) return null
	return (
		<div className={`StudySources${overlay ? ' StudySources--overlay' : ''}`}>
			{sources.slice(0, 3).map((source) => (
				<button
					key={`${source.documentID}:${source.pageNumber}`}
					onClick={() => focusPDFCitation(editor, source)}
					{...canvasInteractionHandlers}
					title={`Show ${source.documentTitle}, page ${source.pageNumber}`}
					type="button"
				>
					<IconFileText aria-hidden="true" size={11} stroke={1.8} />
					<span>{source.documentTitle}</span>
					<small>p. {source.pageNumber}</small>
				</button>
			))}
			{sources.length > 3 ? <span>+{sources.length - 3}</span> : null}
		</div>
	)
}

function readStudySources(shape: TLShape): PDFSourceReference[] {
	const parsed = z.object({
		agentboard: z.object({ sources: pdfSourceReferenceSchema.array() }),
	}).safeParse(shape.meta)
	return parsed.success ? parsed.data.agentboard.sources : []
}

function getBoxIndicator(width: number, height: number) {
	const path = new Path2D()
	path.roundRect(0, 0, width, height, 12)
	return path
}

function StudyMath({ children, className }: { children: string; className: string }) {
	return (
		<Streamdown className={className} controls={false} mode="static" plugins={studyMarkdownPlugins}>
			{children}
		</Streamdown>
	)
}

export const studyShapeUtils = [
	FlashcardShapeUtil,
	QuizShapeUtil,
	ReviewShapeUtil,
	WalkthroughShapeUtil,
	ConceptMapShapeUtil,
	TeachBackShapeUtil,
	LectureShapeUtil,
	PDFPageShapeUtil,
] as const
