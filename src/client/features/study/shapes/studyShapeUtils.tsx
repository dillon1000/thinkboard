import {
	CONCEPT_MAP_SHAPE_TYPE,
	FLASHCARD_CANVAS_HEIGHT,
	FLASHCARD_CANVAS_WIDTH,
	FLASHCARD_SHAPE_TYPE,
	QUIZ_SHAPE_TYPE,
	REVIEW_SHAPE_TYPE,
	WALKTHROUGH_SHAPE_TYPE,
	PDF_PAGE_SHAPE_TYPE,
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
	type PDFPageShapeProps,
	type PDFSourceReference,
} from '@agentboard/shared'
import {
	IconCards,
	IconDownload,
	IconFileText,
	IconMessageCircleCheck,
	IconPencil,
	IconQuestionMark,
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
import { PDFPageInteractiveLayer } from '../components/PDFPageInteractiveLayer'
import { studyMarkdownPlugins } from '../lib/studyMath'
import { focusPDFCitation } from '../lib/pdfCitation'
import { useBoardChrome } from '../../boards/lib/BoardChromeProvider'

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		[FLASHCARD_SHAPE_TYPE]: FlashcardShapeProps
		[CONCEPT_MAP_SHAPE_TYPE]: ConceptMapShapeProps
		[QUIZ_SHAPE_TYPE]: QuizShapeProps
		[REVIEW_SHAPE_TYPE]: ReviewShapeProps
		[WALKTHROUGH_SHAPE_TYPE]: WalkthroughShapeProps
		[PDF_PAGE_SHAPE_TYPE]: PDFPageShapeProps
	}
}

export type FlashcardShape = TLShape<typeof FLASHCARD_SHAPE_TYPE>
export type ConceptMapShape = TLShape<typeof CONCEPT_MAP_SHAPE_TYPE>
export type QuizShape = TLShape<typeof QUIZ_SHAPE_TYPE>
export type ReviewShape = TLShape<typeof REVIEW_SHAPE_TYPE>
export type WalkthroughShape = TLShape<typeof WALKTHROUGH_SHAPE_TYPE>
export type PDFPageShape = TLShape<typeof PDF_PAGE_SHAPE_TYPE>

const STUDY_SHAPE_HEADING_HEIGHT = 30

export const canvasInteractionHandlers = {
	onPointerDown: stopCanvasInteraction,
	onTouchEnd: stopCanvasInteraction,
	onTouchStart: stopCanvasInteraction,
}

function stopCanvasInteraction(event: { stopPropagation: () => void }) {
	event.stopPropagation()
}

type AutoFitShape = FlashcardShape | QuizShape | ReviewShape | WalkthroughShape

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
	// Answer visibility is private UI state, so a click does not reveal it for collaborators.
	const [isRevealed, setIsRevealed] = useState(false)
	const fitRef = useAutoFitHeight(shape, FLASHCARD_CANVAS_HEIGHT)

	function toggleAnswer() {
		setIsRevealed((current) => !current)
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
					aria-label={isRevealed ? 'Show flashcard question' : 'Reveal flashcard answer'}
					className={`Flashcard-reveal${isRevealed ? ' is-revealed' : ''}`}
					onClick={toggleAnswer}
					onKeyDown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return
						event.preventDefault()
						toggleAnswer()
					}}
					role="button"
					tabIndex={0}
				>
					<StudyMath className="Flashcard-copy">
						{isRevealed ? shape.props.back : shape.props.front}
					</StudyMath>
					<span>{isRevealed ? 'Click for question' : 'Click to reveal'}</span>
				</div>
				<StudySources shape={shape} />
			</div>
			{isEditing ? <FlashcardEditorDialog onClose={() => setIsEditing(false)} shape={shape} /> : null}
		</HTMLContainer>
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
	const agentboard = Reflect.get(shape.meta, 'agentboard')
	if (!agentboard || typeof agentboard !== 'object') return []
	const parsed = pdfSourceReferenceSchema.array().safeParse(Reflect.get(agentboard, 'sources'))
	return parsed.success ? parsed.data : []
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
	PDFPageShapeUtil,
] as const
