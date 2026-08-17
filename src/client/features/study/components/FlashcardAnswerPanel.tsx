import {
	apiRoutes,
	type FlashcardAnswerAttemptRequest,
	type FlashcardAnswerAttemptResult,
	type FlashcardAnswerCompletionResult,
	type FlashcardFinalVerdict,
	type FlashcardReviewRating,
} from '@agentboard/shared'
import { usePostHog } from '@posthog/react'
import { IconArrowRight, IconCheck, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { Streamdown } from 'streamdown'
import { apiRequest } from '../../../lib/api'
import { studyMarkdownPlugins } from '../lib/studyMath'
import './flashcardAnswerPanel.css'

const ratingLabels = {
	again: 'Again',
	hard: 'Hard',
	good: 'Good',
	easy: 'Easy',
} satisfies Record<FlashcardReviewRating, string>

interface FlashcardAnswerPanelProps {
	className?: string
	onCompleted?: (result: FlashcardAnswerCompletionResult) => void | Promise<void>
	source: FlashcardAnswerAttemptRequest['source']
}

export function FlashcardAnswerPanel({
	className,
	onCompleted,
	source,
}: FlashcardAnswerPanelProps) {
	const [answer, setAnswer] = useState('')
	const [result, setResult] = useState<FlashcardAnswerAttemptResult | null>(null)
	const [finalVerdict, setFinalVerdict] = useState<FlashcardFinalVerdict | null>(null)
	const [rating, setRating] = useState<FlashcardReviewRating>('good')
	const [isChecking, setIsChecking] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const posthog = usePostHog()

	async function checkAnswer(action: 'answer' | 'skip') {
		setIsChecking(true)
		setError(null)
		try {
			const checked = await apiRequest<FlashcardAnswerAttemptResult>(
				apiRoutes.studyAnswerAttempts,
				{
					body: JSON.stringify(action === 'answer'
						? { action, answer, source }
						: { action, source }),
					method: 'POST',
				}
			)
			const initialVerdict = checked.attempt.finalVerdict
			posthog?.capture('flashcard_answer_checked', {
				action,
				verdict: initialVerdict,
				source_kind: source.kind,
				is_due: checked.isDue,
			})
			setResult(checked)
			setFinalVerdict(initialVerdict)
			setRating(initialVerdict === 'correct' ? 'good' : 'again')
		} catch (checkError) {
			setError(checkError instanceof Error ? checkError.message : 'Unable to check this answer')
		} finally {
			setIsChecking(false)
		}
	}

	function chooseVerdict(verdict: Exclude<FlashcardFinalVerdict, 'skipped'>) {
		setFinalVerdict(verdict)
		setRating(verdict === 'correct' ? 'good' : 'again')
	}

	async function completeAnswer() {
		if (!result || !finalVerdict) return
		setIsSaving(true)
		setError(null)
		try {
			const completed = await apiRequest<FlashcardAnswerCompletionResult>(
				apiRoutes.studyAnswerAttemptComplete(result.attempt.id),
				{
					body: JSON.stringify({
						finalVerdict,
						...(result.isDue ? { rating } : {}),
					}),
					method: 'POST',
				}
			)
			posthog?.capture('flashcard_review_completed', {
				final_verdict: finalVerdict,
				...(result.isDue ? { rating } : {}),
				is_due: result.isDue,
				source_kind: source.kind,
			})
			await onCompleted?.(completed)
			setAnswer('')
			setResult(null)
			setFinalVerdict(null)
			setRating('good')
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : 'Unable to save this answer')
		} finally {
			setIsSaving(false)
		}
	}

	const rootClassName = ['FlashcardAnswerPanel', className].filter(Boolean).join(' ')
	if (!result) {
		return (
			<div className={rootClassName}>
				<label>
					<span>Your answer</span>
					<textarea
						autoComplete="off"
						disabled={isChecking}
						maxLength={1_200}
						onChange={(event) => setAnswer(event.target.value)}
						rows={2}
						value={answer}
					/>
				</label>
				<div className="FlashcardAnswerPanel-actions">
					<button
						className="Button Button--primary"
						disabled={!answer.trim() || isChecking}
						onClick={() => void checkAnswer('answer')}
						type="button"
					>
						{isChecking ? 'Checking…' : 'Check'}
					</button>
					<button
						disabled={isChecking}
						onClick={() => void checkAnswer('skip')}
						type="button"
					>
						I don’t know
					</button>
				</div>
				{error ? <p className="FormError" role="alert">{error}</p> : null}
			</div>
		)
	}

	const isOriginalCorrect = result.attempt.originalVerdict === 'correct'
	const needsSelfGrade = result.attempt.originalVerdict === 'uncertain'
	return (
		<div className={`${rootClassName} is-result`} aria-live="polite">
			<div className={`FlashcardAnswerPanel-verdict ${isOriginalCorrect ? 'is-correct' : ''}`}>
				<span>{isOriginalCorrect ? <IconCheck aria-hidden="true" size={16} /> : <IconX aria-hidden="true" size={16} />}</span>
				<div>
					<strong>{needsSelfGrade
						? 'You decide'
						: isOriginalCorrect
							? 'Correct'
							: result.attempt.originalVerdict === 'skipped'
								? 'Answer revealed'
								: 'Not quite'}
					</strong>
					{result.attempt.feedback ? <p>{result.attempt.feedback}</p> : null}
				</div>
			</div>

			<div className="FlashcardAnswerPanel-expected">
				<small>Answer</small>
				<Streamdown plugins={studyMarkdownPlugins}>{result.attempt.primaryAnswer}</Streamdown>
				{result.attempt.matchedAnswer
					&& result.attempt.matchedAnswer !== result.attempt.primaryAnswer
					? <p><span>Matched alternate:</span> {result.attempt.matchedAnswer}</p>
					: null}
			</div>

			<div>
				<small>Count this response as</small>
				<div className="FlashcardAnswerPanel-choice" role="group" aria-label="Final answer verdict">
					<button
						aria-pressed={finalVerdict === 'correct'}
						className={finalVerdict === 'correct' ? 'is-selected' : undefined}
						onClick={() => chooseVerdict('correct')}
						type="button"
					>
						Correct
					</button>
					<button
						aria-pressed={finalVerdict === 'incorrect'}
						className={finalVerdict === 'incorrect' ? 'is-selected' : undefined}
						onClick={() => chooseVerdict('incorrect')}
						type="button"
					>
						Not quite
					</button>
				</div>
			</div>

			{result.isDue ? (
				<div>
					<small>Next review</small>
					<div className="FlashcardAnswerPanel-ratings" role="group" aria-label="Review rating">
						{(['again', 'hard', 'good', 'easy'] as const).map((value) => (
							<button
								aria-pressed={rating === value}
								className={rating === value ? 'is-selected' : undefined}
								key={value}
								onClick={() => setRating(value)}
								type="button"
							>
								{ratingLabels[value]}
							</button>
						))}
					</div>
				</div>
			) : null}

			<button
				className="Button Button--primary FlashcardAnswerPanel-continue"
				disabled={!finalVerdict || isSaving}
				onClick={() => void completeAnswer()}
				type="button"
			>
				{isSaving ? 'Saving…' : result.isDue ? 'Continue' : 'Finish'}
				{!isSaving ? <IconArrowRight aria-hidden="true" size={15} /> : null}
			</button>
			{error ? <p className="FormError" role="alert">{error}</p> : null}
		</div>
	)
}
