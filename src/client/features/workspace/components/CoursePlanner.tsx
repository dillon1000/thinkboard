import { apiRoutes, courseSchema, type Board, type Course } from '@agentboard/shared'
import {
	IconBook2,
	IconCheck,
	IconPencil,
	IconPlus,
	IconTrash,
	IconX,
} from '@tabler/icons-react'
import { useState, type CSSProperties, type FormEvent } from 'react'
import { z } from 'zod'
import { apiRequest } from '../../../lib/api'
import './coursePlanner.css'

interface CoursePlannerProps {
	boards: Board[]
	courses: Course[]
	onBoardsChange: (boards: Board[]) => void
	onCoursesChange: (courses: Course[]) => void
	onError: (message: string) => void
}

export function CoursePlanner({
	boards,
	courses,
	onBoardsChange,
	onCoursesChange,
	onError,
}: CoursePlannerProps) {
	const [isCreating, setIsCreating] = useState(false)
	const [title, setTitle] = useState('')
	const [examDate, setExamDate] = useState('')
	const [color, setColor] = useState('#5f6f52')
	const [isSaving, setIsSaving] = useState(false)

	async function createCourse(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!title.trim()) return
		setIsSaving(true)
		try {
			const response = await apiRequest(apiRoutes.courses, {
				method: 'POST',
				body: JSON.stringify({
					color,
					examDate: examDate || null,
					title,
				}),
			}, z.object({ course: courseSchema }))
			onCoursesChange([response.course, ...courses])
			setTitle('')
			setExamDate('')
			setIsCreating(false)
		} catch (error) {
			onError(error instanceof Error ? error.message : 'Unable to create course')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<section className="CoursePlanner" aria-labelledby="courses-heading">
			<div className="SectionHeading">
				<span className="SectionHeading-toggle" id="courses-heading">
					<IconBook2 aria-hidden="true" size={14} /> Courses and exams
				</span>
				<span className="SectionHeading-count">{courses.length || ''}</span>
				<button className="SectionHeading-new" onClick={() => setIsCreating(true)} type="button">
					<IconPlus aria-hidden="true" size={14} stroke={2} /> New course
				</button>
			</div>

			{isCreating ? (
				<form className="CourseComposer" onSubmit={(event) => void createCourse(event)}>
					<input
						aria-label="Course color"
						onChange={(event) => setColor(event.target.value)}
						type="color"
						value={color}
					/>
					<input
						aria-label="Course name"
						autoFocus
						maxLength={80}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="Organic chemistry"
						required
						value={title}
					/>
					<input
						aria-label="Exam date"
						min={new Date().toISOString().slice(0, 10)}
						onChange={(event) => setExamDate(event.target.value)}
						type="date"
						value={examDate}
					/>
					<button disabled={isSaving} type="submit">
						<IconCheck aria-hidden="true" size={15} /> {isSaving ? 'Saving…' : 'Add'}
					</button>
					<button
						aria-label="Cancel new course"
						onClick={() => setIsCreating(false)}
						type="button"
					>
						<IconX aria-hidden="true" size={15} />
					</button>
				</form>
			) : null}

			{courses.length ? (
				<div className="CourseGrid">
					{courses.map((course) => (
						<CourseCard
							boards={boards}
							course={course}
							key={course.id}
							onBoardsChange={onBoardsChange}
							onCoursesChange={onCoursesChange}
							onError={onError}
							courses={courses}
						/>
					))}
				</div>
			) : !isCreating ? (
				<p className="CoursePlanner-empty">
					Group spaces by course and add an exam date to drive your study plan.
				</p>
			) : null}
		</section>
	)
}

function CourseCard({
	boards,
	course,
	courses,
	onBoardsChange,
	onCoursesChange,
	onError,
}: CoursePlannerProps & { course: Course }) {
	const [isEditing, setIsEditing] = useState(false)
	const [title, setTitle] = useState(course.title)
	const [examDate, setExamDate] = useState(course.examDate ?? '')
	const [color, setColor] = useState(course.color)
	const linkedBoards = boards.filter((board) => board.courseID === course.id)
	const availableBoards = boards.filter((board) =>
		board.role === 'owner' && board.courseID !== course.id
	)

	async function updateCourse(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		try {
			const response = await apiRequest(apiRoutes.course(course.id), {
				method: 'PATCH',
				body: JSON.stringify({ color, examDate: examDate || null, title }),
			}, z.object({ course: courseSchema }))
			onCoursesChange(courses.map((item) => item.id === course.id ? response.course : item))
			setIsEditing(false)
		} catch (error) {
			onError(error instanceof Error ? error.message : 'Unable to update course')
		}
	}

	async function deleteCourse() {
		if (!window.confirm(`Delete “${course.title}”? Spaces in the course will stay available.`)) return
		try {
			await apiRequest(apiRoutes.course(course.id), { method: 'DELETE' })
			onCoursesChange(courses.filter(({ id }) => id !== course.id))
			onBoardsChange(boards.map((board) =>
				board.courseID === course.id ? { ...board, courseID: null } : board
			))
		} catch (error) {
			onError(error instanceof Error ? error.message : 'Unable to delete course')
		}
	}

	async function setCourse(boardID: string, courseID: string | null) {
		try {
			await apiRequest(apiRoutes.boardCourse(boardID), {
				method: 'PATCH',
				body: JSON.stringify({ courseID }),
			})
			onBoardsChange(boards.map((board) =>
				board.id === boardID ? { ...board, courseID } : board
			))
		} catch (error) {
			onError(error instanceof Error ? error.message : 'Unable to update space course')
		}
	}

	return (
		<article className="CourseCard" style={{ '--course-color': course.color } as CSSProperties}>
			<header>
				<span aria-hidden="true" />
				<div>
					<strong>{course.title}</strong>
					<small>{course.examDate ? examCountdown(course.examDate) : 'No exam date'}</small>
				</div>
				{course.editable ? (
					<>
						<button
							aria-label={`Edit ${course.title}`}
							onClick={() => setIsEditing((current) => !current)}
							type="button"
						>
							<IconPencil aria-hidden="true" size={14} />
						</button>
						<button
							aria-label={`Delete ${course.title}`}
							onClick={() => void deleteCourse()}
							type="button"
						>
							<IconTrash aria-hidden="true" size={14} />
						</button>
					</>
				) : null}
			</header>

			{isEditing ? (
				<form className="CourseCard-edit" onSubmit={(event) => void updateCourse(event)}>
					<input
						aria-label="Course color"
						onChange={(event) => setColor(event.target.value)}
						type="color"
						value={color}
					/>
					<input
						aria-label="Course name"
						maxLength={80}
						onChange={(event) => setTitle(event.target.value)}
						required
						value={title}
					/>
					<input
						aria-label="Exam date"
						onChange={(event) => setExamDate(event.target.value)}
						type="date"
						value={examDate}
					/>
					<button type="submit"><IconCheck aria-hidden="true" size={14} /> Save</button>
				</form>
			) : null}

			<div className="CourseCard-spaces">
				{linkedBoards.map((board) => (
					<button
						disabled={!course.editable || board.role !== 'owner'}
						key={board.id}
						onClick={() => void setCourse(board.id, null)}
						title={course.editable ? 'Remove from course' : undefined}
						type="button"
					>
						{board.title}
						{course.editable && board.role === 'owner' ? <IconX aria-hidden="true" size={12} /> : null}
					</button>
				))}
				{!linkedBoards.length ? <small>No spaces assigned</small> : null}
			</div>

			{course.editable && availableBoards.length ? (
				<label className="CourseCard-assign">
					<IconPlus aria-hidden="true" size={13} />
					<select
						aria-label={`Add space to ${course.title}`}
						onChange={(event) => {
							const boardID = event.target.value
							event.target.value = ''
							if (boardID) void setCourse(boardID, course.id)
						}}
						value=""
					>
						<option value="">Add a space…</option>
						{availableBoards.map((board) => (
							<option key={board.id} value={board.id}>{board.title}</option>
						))}
					</select>
				</label>
			) : null}
		</article>
	)
}

function examCountdown(examDate: string) {
	const exam = new Date(`${examDate}T23:59:59`)
	const days = Math.ceil((exam.getTime() - Date.now()) / 86_400_000)
	if (days < 0) return `Exam was ${Math.abs(days)} days ago`
	if (days === 0) return 'Exam today'
	if (days === 1) return 'Exam tomorrow'
	return `${days} days to exam`
}
