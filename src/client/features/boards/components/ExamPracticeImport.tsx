import {
	apiRoutes,
	type ExamPracticeSet,
} from '@agentboard/shared'
import { IconClipboardCheck, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { Editor } from 'tldraw'
import { apiRequest } from '../../../lib/api'
import {
	applyProposal,
	persistProposalEffect,
} from '../../study/lib/studyProposalApply'
import './examPracticeImport.css'

interface ExamPracticeImportProps {
	boardID: string
	editor: Editor
	examID: string
	onClose: () => void
}

export function ExamPracticeImport({
	boardID,
	editor,
	examID,
	onClose,
}: ExamPracticeImportProps) {
	const [practice, setPractice] = useState<ExamPracticeSet | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isAdding, setIsAdding] = useState(false)

	useEffect(() => {
		void apiRequest<{ practice: ExamPracticeSet }>(apiRoutes.examPractice(examID), {
			method: 'POST',
		})
			.then((response) => setPractice(response.practice))
			.catch((loadError) => {
				setError(loadError instanceof Error ? loadError.message : 'Unable to assemble practice exam')
			})
	}, [examID])

	async function addToCanvas() {
		if (!practice || practice.boardID !== boardID) return
		setIsAdding(true)
		try {
			const viewport = editor.getViewportPageBounds()
			const effect = applyProposal(editor, 'createPracticeSet', practice.proposal, {
				anchor: { x: viewport.center.x - 390, y: viewport.center.y - 350 },
			})
			await persistProposalEffect(boardID, effect)
			editor.zoomToSelection({ animation: { duration: 280 } })
			onClose()
		} catch (addError) {
			setError(addError instanceof Error ? addError.message : 'Unable to add the practice exam')
			setIsAdding(false)
		}
	}

	return (
		<aside aria-live="polite" className="ExamPracticeImport">
			<header>
				<span><IconClipboardCheck aria-hidden="true" size={17} /></span>
				<div>
					<strong>Practice exam</strong>
					<small>Review before adding it to this space.</small>
				</div>
				<button aria-label="Close practice exam" onClick={onClose} type="button">
					<IconX aria-hidden="true" size={16} />
				</button>
			</header>
			{!practice && !error ? <p>Assembling questions from your study material…</p> : null}
			{error ? <p className="FormError" role="alert">{error}</p> : null}
			{practice ? (
				<>
					<ol>
						{practice.proposal.quizzes.map((quiz) => (
							<li key={quiz.question}>{quiz.question}</li>
						))}
					</ol>
					<footer>
						<button onClick={onClose} type="button">Cancel</button>
						<button disabled={isAdding} onClick={() => void addToCanvas()} type="button">
							{isAdding ? 'Adding…' : 'Add to canvas'}
						</button>
					</footer>
				</>
			) : null}
		</aside>
	)
}
