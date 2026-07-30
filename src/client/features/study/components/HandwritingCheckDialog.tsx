import {
	apiRoutes,
	type ActiveRecallGradeResponse,
	type ActiveRecallRegion,
} from '@agentboard/shared'
import {
	IconCheck,
	IconCircleX,
	IconLoader2,
	IconQuestionMark,
	IconX,
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
	createShapeId,
	toRichText,
	type Editor,
	type TLGeoShape,
	type TLShapeId,
} from 'tldraw'
import { apiRequest } from '../../../lib/api'
import { captureCanvasContext } from '../lib/canvasContextCapture'
import {
	applyProposal,
	persistProposalEffect,
} from '../lib/studyProposalApply'
import './activeRecall.css'

interface HandwritingCheckDialogProps {
	boardID: string
	editor: Editor
	onClose: () => void
}

interface SelectionBounds {
	h: number
	w: number
	x: number
	y: number
}

export function HandwritingCheckDialog({
	boardID,
	editor,
	onClose,
}: HandwritingCheckDialogProps) {
	const [result, setResult] = useState<ActiveRecallGradeResponse | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isAdding, setIsAdding] = useState(false)
	const bounds = useRef<SelectionBounds | null>(null)

	useEffect(() => {
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', closeOnEscape)
		const selectionBounds = editor.getSelectionPageBounds()
		bounds.current = selectionBounds
			? {
					h: selectionBounds.h,
					w: selectionBounds.w,
					x: selectionBounds.x,
					y: selectionBounds.y,
				}
			: null
		void checkSelection()
		return () => window.removeEventListener('keydown', closeOnEscape)
	}, [])

	async function checkSelection() {
		try {
			const canvasContext = await captureCanvasContext(boardID, editor)
			if (!canvasContext.selectionImage) {
				throw new Error('Select the handwritten steps that you want to check')
			}
			const grade = await apiRequest<ActiveRecallGradeResponse>(
				apiRoutes.boardActiveRecallGrade(boardID),
				{
					body: JSON.stringify({
						canvasContext,
						explanation: '',
						mode: 'handwriting-check',
						sourceText: '',
						topic: 'Check this worked solution step by step',
					}),
					method: 'POST',
				}
			)
			setResult(grade)
		} catch (checkError) {
			setError(checkError instanceof Error ? checkError.message : 'Unable to check this work')
		}
	}

	async function addAnnotation() {
		if (!result || !bounds.current) return
		setIsAdding(true)
		setError(null)
		try {
			const problemStep = result.steps.find(({ status }) => status === 'incorrect') ??
				result.steps.find(({ status }) => status === 'unclear')
			const shapeIDs: TLShapeId[] = []
			editor.markHistoryStoppingPoint('handwriting feedback')
			if (problemStep?.region) {
				const circleID = createMistakeCircle(editor, bounds.current, problemStep.region)
				shapeIDs.push(circleID)
			}
			const effect = applyProposal(editor, 'addReviewNote', {
				body: problemStep
					? `${problemStep.feedback}\n\nNext: ${result.nextStep}`
					: result.nextStep,
				severity: result.verdict === 'correct' ? 'check' : 'correction',
				title: result.verdict === 'correct' ? 'Handwriting check' : problemStep?.label ?? 'Check this step',
				x: bounds.current.x + bounds.current.w + 28,
				y: bounds.current.y,
			})
			await persistProposalEffect(boardID, effect)
			editor.setSelectedShapes([...shapeIDs, ...effect.shapeIDs])
			editor.zoomToSelection({ animation: { duration: 260 } })
			onClose()
		} catch (annotationError) {
			setError(annotationError instanceof Error
				? annotationError.message
				: 'Unable to add this annotation')
			setIsAdding(false)
		}
	}

	return createPortal(
		<div
			aria-labelledby="handwriting-check-heading"
			aria-modal="true"
			className="ActiveRecall-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
			role="dialog"
		>
			<section className="ActiveRecall-dialog">
				<header>
					<div>
						<p className="Eyebrow">Handwriting check</p>
						<h2 id="handwriting-check-heading">Check the selected work</h2>
						<p>The checker reads each visible step. You decide whether its feedback reaches the canvas.</p>
					</div>
					<button aria-label="Close handwriting check" onClick={onClose} type="button">
						<IconX aria-hidden="true" size={18} />
					</button>
				</header>

				{!result && !error ? (
					<p className="ActiveRecall-loading" role="status">
						<IconLoader2 aria-hidden="true" size={16} /> Reading the derivation…
					</p>
				) : null}
				{error ? <p className="FormError" role="alert">{error}</p> : null}

				{result ? (
					<>
						<div className={`ActiveRecall-score is-${result.verdict}`}>
							<strong>{result.score}%</strong>
							<span><b>{formatVerdict(result.verdict)}</b><small>{result.summary}</small></span>
						</div>
						<ol className="ActiveRecall-steps">
							{result.steps.map((step, index) => (
								<li className={`is-${step.status}`} key={`${index}-${step.label}`}>
									<span>
										{step.status === 'correct'
											? <IconCheck aria-hidden="true" size={14} />
											: step.status === 'incorrect'
												? <IconCircleX aria-hidden="true" size={14} />
												: <IconQuestionMark aria-hidden="true" size={14} />}
									</span>
									<div><strong>{step.label}</strong><p>{step.feedback}</p></div>
								</li>
							))}
						</ol>
						<footer>
							<button onClick={onClose} type="button">Keep canvas unchanged</button>
							<button disabled={isAdding} onClick={() => void addAnnotation()} type="button">
								{isAdding ? 'Adding…' : result.verdict === 'correct'
									? 'Add check note'
									: 'Circle step and add note'}
							</button>
						</footer>
					</>
				) : null}
			</section>
		</div>,
		document.body
	)
}

function createMistakeCircle(
	editor: Editor,
	bounds: SelectionBounds,
	region: ActiveRecallRegion
) {
	const padding = Math.max(10, Math.min(bounds.w, bounds.h) * 0.02)
	const id = createShapeId()
	editor.createShape<TLGeoShape>({
		id,
		type: 'geo',
		x: bounds.x + region.x * bounds.w - padding,
		y: bounds.y + region.y * bounds.h - padding,
		meta: { agentboard: { createdBy: 'handwriting-check', proposalType: 'correction' } },
		props: {
			color: 'red',
			dash: 'draw',
			fill: 'none',
			geo: 'ellipse',
			h: Math.max(36, region.h * bounds.h + padding * 2),
			richText: toRichText(''),
			size: 'm',
			w: Math.max(48, region.w * bounds.w + padding * 2),
		},
	})
	return id
}

function formatVerdict(verdict: ActiveRecallGradeResponse['verdict']) {
	if (verdict === 'correct') return 'The steps hold together'
	if (verdict === 'partial') return 'Some steps need work'
	if (verdict === 'incorrect') return 'A step changes the result'
	return 'Some writing is unclear'
}
