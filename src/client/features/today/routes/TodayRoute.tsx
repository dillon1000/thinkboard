import {
	apiRoutes,
	appRoutes,
	boardSchema,
	courseSchema,
	studyTodayDashboardSchema,
	type Board,
	type Course,
	type FlashcardAnswerAttempt,
	type ExamPlan,
	type StudyTodayDashboard,
} from '@agentboard/shared'
import {
	IconBrain,
	IconCalendarDue,
	IconCards,
	IconClipboardCheck,
	IconFlame,
	IconPlus,
	IconTrash,
} from '@tabler/icons-react'
import { type ReactNode, useMemo, useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import { Streamdown } from 'streamdown'
import { z } from 'zod'
import { apiRequest } from '../../../lib/api'
import { cssVariables } from '../../../lib/styleTypes'
import { WorkspaceShell } from '../../auth/components/WorkspaceShell'
import { FlashcardAnswerPanel } from '../../study/components/FlashcardAnswerPanel'
import { studyMarkdownPlugins } from '../../study/lib/studyMath'
import '../styles/today.css'
import { ExamPlannerDialog } from '../components/ExamPlannerDialog'

interface TodayLoaderData {
	boards: Board[]
	courses: Course[]
	dashboard: StudyTodayDashboard | null
	error: string | null
	examSourcesError: string | null
}

/** Loads the initial study dashboard before React renders the route. */
export async function loader(): Promise<TodayLoaderData> {
	const sourcesPromise = Promise.all([
		apiRequest(apiRoutes.boards, undefined, z.object({ boards: z.array(boardSchema) })),
		apiRequest(apiRoutes.courses, undefined, z.object({ courses: z.array(courseSchema) })),
	]).then(([boardResponse, courseResponse]) => ({
		boards: boardResponse.boards,
		courses: courseResponse.courses,
		error: null,
	})).catch((loadError) => ({
		boards: [],
		courses: [],
		error: loadError instanceof Error ? loadError.message : 'Unable to load study sources',
	}))
	try {
		const [dashboard, sources] = await Promise.all([
			apiRequest(apiRoutes.studyToday, undefined, studyTodayDashboardSchema),
			sourcesPromise,
		])
		return {
			boards: sources.boards,
			courses: sources.courses,
			dashboard,
			error: null,
			examSourcesError: sources.error,
		}
	} catch (loadError) {
		const sources = await sourcesPromise
		return {
			boards: sources.boards,
			courses: sources.courses,
			dashboard: null,
			error: loadError instanceof Error ? loadError.message : 'Unable to load today’s session',
			examSourcesError: sources.error,
		}
	}
}

export function Component() {
	const initial = useLoaderData<typeof loader>()
	const [dashboard, setDashboard] = useState(initial.dashboard)
	const [error, setError] = useState(initial.error)
	const [isExamPlannerOpen, setIsExamPlannerOpen] = useState(false)

	async function loadDashboard() {
		try {
			setDashboard(await apiRequest(apiRoutes.studyToday, undefined, studyTodayDashboardSchema))
			setError(null)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load today’s session')
		}
	}

	async function deleteAttempt(attemptID: string) {
		setError(null)
		try {
			await apiRequest(apiRoutes.studyAnswerAttempt(attemptID), { method: 'DELETE' })
			await loadDashboard()
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this answer')
		}
	}

	async function deleteCardAttempts(attempt: FlashcardAnswerAttempt) {
		if (!window.confirm('Delete your answer history for this card? Its review schedule will stay the same.')) return
		setError(null)
		try {
			await apiRequest(apiRoutes.studyCardAnswerAttempts(attempt.boardID, attempt.shapeID), {
				method: 'DELETE',
			})
			await loadDashboard()
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this card history')
		}
	}

	async function deleteExam(examID: string) {
		if (!window.confirm('Delete this exam countdown? Your spaces and study material will stay the same.')) return
		setError(null)
		try {
			await apiRequest(apiRoutes.examPlan(examID), { method: 'DELETE' })
			await loadDashboard()
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete exam plan')
		}
	}

	const reviewed = useMemo(
		() => dashboard?.trend.reduce((total, day) => total + day.reviewed, 0) ?? 0,
		[dashboard]
	)
	const remembered = useMemo(
		() => dashboard?.trend.reduce((total, day) => total + day.remembered, 0) ?? 0,
		[dashboard]
	)
	const mastery = reviewed ? Math.round(remembered / reviewed * 100) : 0
	const activeCard = dashboard?.dueReviews[0]

	return (
		<WorkspaceShell activePage="today" skipTargetID="today-content" title="Today">
			<div className="Today" id="today-content">
				<header className="Today-heading">
					<p className="Eyebrow">Adaptive study</p>
					<h1>Today</h1>
					<p>Your due cards, review progress, and repeated learning patterns are in one session.</p>
				</header>

				{error ? <p className="FormError" role="alert">{error}</p> : null}
				{!dashboard && !error ? <p className="Today-loading" role="status">Building your session…</p> : null}

				{dashboard ? (
					<>
						<section aria-label="Study summary" className="Today-metrics">
							<Metric icon={<IconCards aria-hidden="true" size={17} />} label="Due now" value={dashboard.dueReviews.length} />
							<Metric icon={<IconBrain aria-hidden="true" size={17} />} label="7-day mastery" suffix="%" value={mastery} />
							<Metric icon={<IconFlame aria-hidden="true" size={17} />} label="Review streak" suffix={dashboard.streakDays === 1 ? ' day' : ' days'} value={dashboard.streakDays} />
						</section>

						<section aria-labelledby="session-heading" className="Today-section">
							<div className="Today-sectionHeading">
								<div>
									<p className="Eyebrow">Next action</p>
									<h2 id="session-heading">Today’s session</h2>
								</div>
								{activeCard ? <span>{dashboard.dueReviews.length} remaining</span> : null}
							</div>
							{activeCard ? (
								<article className="Today-card">
									<div className="Today-cardMeta">
										<Link to={appRoutes.board(activeCard.boardID)}>{activeCard.boardTitle}</Link>
										<span>{activeCard.reviewCount ? `Review ${activeCard.reviewCount + 1}` : 'New card'}</span>
									</div>
									<Markdown className="Today-cardFront">{activeCard.front}</Markdown>
									<FlashcardAnswerPanel
										key={activeCard.reviewID}
										onCompleted={loadDashboard}
										source={{ kind: 'review', reviewID: activeCard.reviewID }}
									/>
								</article>
							) : (
								<div className="Today-complete">
									<span><IconCards aria-hidden="true" size={20} /></span>
									<strong>You’re caught up.</strong>
									<p>Your next card will appear here when it is due.</p>
								</div>
							)}
						</section>

						<section aria-labelledby="exam-mode-heading" className="Today-section">
							<div className="Today-sectionHeading">
								<div>
									<p className="Eyebrow">Countdowns</p>
									<h2 id="exam-mode-heading">Exam mode</h2>
								</div>
								<button
									className="Today-addExam"
									onClick={() => setIsExamPlannerOpen(true)}
									type="button"
								>
									<IconPlus aria-hidden="true" size={14} /> Add exam
								</button>
							</div>
							{dashboard.exams.length ? (
								<div className="Today-exams">
									{dashboard.exams.map((exam) => (
										<ExamCard
											exam={exam}
											key={exam.id}
											onDelete={() => void deleteExam(exam.id)}
										/>
									))}
								</div>
							) : (
								<button
									className="Today-examEmpty"
									onClick={() => setIsExamPlannerOpen(true)}
									type="button"
								>
									<IconCalendarDue aria-hidden="true" size={20} />
									<span><strong>Plan for an exam</strong><small>Choose a date, spaces, and PDFs.</small></span>
								</button>
							)}
						</section>

						<section aria-labelledby="trend-heading" className="Today-section Today-grid">
							<div>
								<div className="Today-sectionHeading">
									<div><p className="Eyebrow">Last seven days</p><h2 id="trend-heading">Review trend</h2></div>
									<span>{reviewed} reviews</span>
								</div>
								<div aria-label="Reviews by day" className="Today-trend">
									{dashboard.trend.map((day) => (
										<div key={day.day}>
											<span className="Today-trendBar" style={cssVariables({ '--review-count': Math.min(day.reviewed, 12) })}>
												<i style={{ height: `${day.reviewed ? Math.max(18, day.remembered / day.reviewed * 100) : 0}%` }} />
											</span>
											<small>{formatDay(day.day)}</small>
										</div>
									))}
								</div>
							</div>

							<div>
								<div className="Today-sectionHeading">
									<div><p className="Eyebrow">From your reviews</p><h2>Learning patterns</h2></div>
								</div>
								{dashboard.patterns.length ? (
									<div className="Today-patterns">
										{dashboard.patterns.map((pattern) => (
											<Link key={pattern.patternKey} to={appRoutes.board(pattern.boardID)}>
												<span><strong>{pattern.title}</strong><small>{pattern.concept}</small></span>
												<em>{pattern.count}×</em>
											</Link>
										))}
									</div>
								) : <p className="Today-patternsEmpty">Patterns appear after the study agent records a repeated mistake.</p>}
							</div>
						</section>

						<section aria-labelledby="answer-history-heading" className="Today-section">
							<details className="Today-history">
								<summary>
									<span id="answer-history-heading">Recent answers</span>
									<small>{dashboard.answerAttempts.length}</small>
								</summary>
								{dashboard.answerAttempts.length ? (
									<div className="Today-historyList">
										{dashboard.answerAttempts.map((attempt) => (
											<article key={attempt.id}>
												<div className="Today-historyMeta">
													<Link to={appRoutes.board(attempt.boardID)}>{attempt.boardTitle}</Link>
													<time dateTime={attempt.createdAt}>{formatAttemptDate(attempt.createdAt)}</time>
												</div>
												<Markdown className="Today-historyQuestion">{attempt.front}</Markdown>
												<p className="Today-historyAnswer">
													<span>{attempt.submittedAnswer ?? 'Skipped'}</span>
													<small>{formatAttemptSummary(attempt)}</small>
												</p>
												<div className="Today-historyActions">
													<button onClick={() => void deleteAttempt(attempt.id)} type="button">
														<IconTrash aria-hidden="true" size={14} /> Delete
													</button>
													<button onClick={() => void deleteCardAttempts(attempt)} type="button">
														Delete card history
													</button>
												</div>
											</article>
										))}
									</div>
								) : <p className="Today-historyEmpty">Checked answers will appear here.</p>}
							</details>
						</section>
					</>
				) : null}
				{isExamPlannerOpen ? (
					<ExamPlannerDialog
						initialBoards={initial.boards}
						initialCourses={initial.courses}
						initialError={initial.examSourcesError}
						onClose={() => setIsExamPlannerOpen(false)}
						onCreated={() => {
							setIsExamPlannerOpen(false)
							void loadDashboard()
						}}
					/>
				) : null}
			</div>
		</WorkspaceShell>
	)
}

function ExamCard({ exam, onDelete }: { exam: ExamPlan; onDelete: () => void }) {
	const dueCards = exam.decks.reduce((total, deck) => total + deck.dueCards, 0)
	const task = exam.tasks[0]
	const days = daysUntil(exam.examDate)
	return (
		<article className="Today-exam">
			<header>
				<div>
					<strong>{exam.title}</strong>
					<time dateTime={exam.examDate}>
						{days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'} left`}
					</time>
				</div>
				<button aria-label={`Delete ${exam.title}`} onClick={onDelete} type="button">
					<IconTrash aria-hidden="true" size={14} />
				</button>
			</header>
			<div className="Today-examSignals">
				<span><b>{dueCards}</b> cards behind</span>
				<span><b>{exam.patterns.length}</b> recurring patterns</span>
			</div>
			{task ? <p>{task.label}</p> : null}
			<div className="Today-examActions">
				<Link to={appRoutes.board(exam.primaryBoardID)}>
					<IconCards aria-hidden="true" size={14} /> Open space
				</Link>
				<Link to={`${appRoutes.board(exam.primaryBoardID)}?examPlan=${encodeURIComponent(exam.id)}`}>
					<IconClipboardCheck aria-hidden="true" size={14} />
					{exam.practiceReady ? 'Open practice exam' : 'Assemble practice exam'}
				</Link>
			</div>
		</article>
	)
}

function Metric({ icon, label, suffix = '', value }: {
	icon: ReactNode
	label: string
	suffix?: string
	value: number
}) {
	return <div className="Today-metric"><span>{icon}</span><strong>{value}{suffix}</strong><small>{label}</small></div>
}

function Markdown({ children, className }: { children: string; className: string }) {
	return <Streamdown className={className} controls={false} mode="static" plugins={studyMarkdownPlugins}>{children}</Streamdown>
}

function formatDay(value: string) {
	return new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function formatAttemptDate(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value))
}

function formatAttemptSummary(attempt: FlashcardAnswerAttempt) {
	const original = formatVerdict(attempt.originalVerdict)
	const final = attempt.finalVerdict ? formatVerdict(attempt.finalVerdict) : 'Pending'
	return `${original} → ${final} · ${attempt.gradingMethod.replaceAll('-', ' ')}`
}

function formatVerdict(value: FlashcardAnswerAttempt['originalVerdict']) {
	if (value === 'incorrect') return 'Not quite'
	if (value === 'uncertain') return 'Self-graded'
	return value.charAt(0).toUpperCase() + value.slice(1)
}

function daysUntil(value: string) {
	const today = new Date()
	const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
	return Math.max(0, Math.ceil((Date.parse(`${value}T00:00:00Z`) - start) / 86_400_000))
}
