import {
	apiRoutes,
	documentSummarySchema,
	examPlanSchema,
	type Board,
	type Course,
	type DocumentSummary,
	type ExamPlan,
} from '@agentboard/shared'
import { IconX } from '@tabler/icons-react'
import { useMemo, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { apiRequest } from '../../../lib/api'

interface ExamPlannerDialogProps {
	initialBoards: Board[]
	initialCourses: Course[]
	initialError: string | null
	onClose: () => void
	onCreated: (exam: ExamPlan) => void
}

export function ExamPlannerDialog({
	initialBoards,
	initialCourses,
	initialError,
	onClose,
	onCreated,
}: ExamPlannerDialogProps) {
	const boards = initialBoards
	const courses = initialCourses
	const [documents, setDocuments] = useState<Record<string, DocumentSummary[]>>({})
	const [boardIDs, setBoardIDs] = useState<string[]>([])
	const [documentIDs, setDocumentIDs] = useState<string[]>([])
	const [primaryBoardID, setPrimaryBoardID] = useState('')
	const [title, setTitle] = useState('')
	const [examDate, setExamDate] = useState('')
	const [error, setError] = useState(initialError)
	const [isSaving, setIsSaving] = useState(false)

	async function toggleBoard(selectedBoard: Board) {
		const isSelected = boardIDs.includes(selectedBoard.id)
		if (isSelected) {
			const nextBoardIDs = boardIDs.filter((id) => id !== selectedBoard.id)
			const removedDocumentIDs = new Set(
				(documents[selectedBoard.id] ?? []).map(({ id }) => id)
			)
			setBoardIDs(nextBoardIDs)
			setDocumentIDs((current) => current.filter((id) => !removedDocumentIDs.has(id)))
			if (primaryBoardID === selectedBoard.id) setPrimaryBoardID(nextBoardIDs[0] ?? '')
			return
		}

		setBoardIDs((current) => [...current, selectedBoard.id])
		if (!primaryBoardID) setPrimaryBoardID(selectedBoard.id)
		const course = courses.find(({ id }) => id === selectedBoard.courseID)
		if (!title && course) setTitle(`${course.title} exam`)
		if (!examDate && course?.examDate) setExamDate(course.examDate)
		if (documents[selectedBoard.id]) return
		try {
			const response = await apiRequest(
				apiRoutes.boardDocuments(selectedBoard.id),
				undefined,
				z.object({ documents: z.array(documentSummarySchema) })
			)
			setDocuments((current) => ({ ...current, [selectedBoard.id]: response.documents }))
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load space PDFs')
		}
	}

	function toggleDocument(documentID: string) {
		setDocumentIDs((current) => current.includes(documentID)
			? current.filter((id) => id !== documentID)
			: [...current, documentID])
	}

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!boardIDs.length || !primaryBoardID) return
		setIsSaving(true)
		setError(null)
		try {
			const response = await apiRequest(apiRoutes.examPlans, {
				body: JSON.stringify({
					boardIDs,
					documentIDs,
					examDate,
					primaryBoardID,
					title,
				}),
				method: 'POST',
			}, z.object({ exam: examPlanSchema }))
			onCreated(response.exam)
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : 'Unable to create exam plan')
		} finally {
			setIsSaving(false)
		}
	}

	const selectedBoards = useMemo(
		() => boards.filter(({ id }) => boardIDs.includes(id)),
		[boardIDs, boards]
	)

	return (
		<div
			aria-labelledby="exam-planner-heading"
			aria-modal="true"
			className="ExamPlanner-backdrop"
			onKeyDown={(event) => {
				if (event.key === 'Escape') onClose()
			}}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
			role="dialog"
		>
			<form className="ExamPlanner" onSubmit={(event) => void submit(event)}>
				<header>
					<div>
						<p className="Eyebrow">Exam mode</p>
						<h2 id="exam-planner-heading">Build a study countdown</h2>
						<p>Select the spaces and processed PDFs that define the exam.</p>
					</div>
					<button aria-label="Close exam planner" onClick={onClose} type="button">
						<IconX aria-hidden="true" size={18} />
					</button>
				</header>

				{error ? <p className="FormError" role="alert">{error}</p> : null}
				<>
						<div className="ExamPlanner-fields">
							<label>
								<span>Exam name</span>
								<input
									maxLength={120}
									onChange={(event) => setTitle(event.target.value)}
									placeholder="Organic chemistry midterm"
									required
									value={title}
								/>
							</label>
							<label>
								<span>Exam date</span>
								<input
									onChange={(event) => setExamDate(event.target.value)}
									required
									type="date"
									value={examDate}
								/>
							</label>
						</div>

						<fieldset>
							<legend>Spaces</legend>
							<div className="ExamPlanner-options">
								{boards.map((board) => (
									<label key={board.id}>
										<input
											checked={boardIDs.includes(board.id)}
											onChange={() => void toggleBoard(board)}
											type="checkbox"
										/>
										<span>{board.title}</span>
									</label>
								))}
							</div>
						</fieldset>

						{selectedBoards.length ? (
							<fieldset>
								<legend>Practice-exam destination</legend>
								<select
									onChange={(event) => setPrimaryBoardID(event.target.value)}
									required
									value={primaryBoardID}
								>
									{selectedBoards.map((board) => (
										<option key={board.id} value={board.id}>{board.title}</option>
									))}
								</select>
							</fieldset>
						) : null}

						{selectedBoards.some((board) => documents[board.id]?.length) ? (
							<fieldset>
								<legend>PDF sources <small>optional</small></legend>
								<div className="ExamPlanner-documents">
									{selectedBoards.flatMap((board) =>
										(documents[board.id] ?? []).map((document) => (
											<label key={document.id}>
												<input
													checked={documentIDs.includes(document.id)}
													disabled={document.status !== 'ready'}
													onChange={() => toggleDocument(document.id)}
													type="checkbox"
												/>
												<span>
													<strong>{document.title}</strong>
													<small>{board.title} · {document.status}</small>
												</span>
											</label>
										))
									)}
								</div>
							</fieldset>
						) : null}

						<footer>
							<button onClick={onClose} type="button">Cancel</button>
							<button disabled={isSaving || !boardIDs.length} type="submit">
								{isSaving ? 'Building…' : 'Start countdown'}
							</button>
						</footer>
				</>
			</form>
		</div>
	)
}
