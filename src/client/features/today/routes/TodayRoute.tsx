import {
	apiRoutes,
	appRoutes,
	type DueFlashcard,
	type FlashcardReviewRating,
	type StudyTodayDashboard,
} from '@agentboard/shared'
import { IconArrowRight, IconBrain, IconCards, IconFlame } from '@tabler/icons-react'
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Streamdown } from 'streamdown'
import { apiRequest } from '../../../lib/api'
import { WorkspaceShell } from '../../auth/components/WorkspaceShell'
import { studyMarkdownPlugins } from '../../study/lib/studyMath'
import '../styles/today.css'

const ratingLabels: Record<FlashcardReviewRating, string> = {
	again: 'Again',
	hard: 'Hard',
	good: 'Good',
	easy: 'Easy',
}

export function Component() {
	const [dashboard, setDashboard] = useState<StudyTodayDashboard | null>(null)
	const [isAnswerVisible, setIsAnswerVisible] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		void loadDashboard()
	}, [])

	async function loadDashboard() {
		try {
			setDashboard(await apiRequest<StudyTodayDashboard>(apiRoutes.studyToday))
			setError(null)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load today’s session')
		}
	}

	async function rateCard(card: DueFlashcard, rating: FlashcardReviewRating) {
		setIsSaving(true)
		try {
			await apiRequest(apiRoutes.studyReview(card.reviewID), {
				body: JSON.stringify({ rating }),
				method: 'POST',
			})
			await loadDashboard()
			setIsAnswerVisible(false)
		} catch (reviewError) {
			setError(reviewError instanceof Error ? reviewError.message : 'Unable to save this review')
		} finally {
			setIsSaving(false)
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
									{isAnswerVisible ? (
										<>
											<Markdown className="Today-cardBack">{activeCard.back}</Markdown>
											<div aria-label="How well did you remember?" className="Today-ratings">
												{(['again', 'hard', 'good', 'easy'] as const).map((rating) => (
													<button disabled={isSaving} key={rating} onClick={() => void rateCard(activeCard, rating)} type="button">
														{ratingLabels[rating]}
													</button>
												))}
											</div>
										</>
									) : (
										<button className="Button Button--primary" onClick={() => setIsAnswerVisible(true)} type="button">
											Show answer <IconArrowRight aria-hidden="true" size={15} />
										</button>
									)}
								</article>
							) : (
								<div className="Today-complete">
									<span><IconCards aria-hidden="true" size={20} /></span>
									<strong>You’re caught up.</strong>
									<p>Your next card will appear here when it is due.</p>
								</div>
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
											<span className="Today-trendBar" style={{ '--review-count': Math.min(day.reviewed, 12) } as CSSProperties}>
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
					</>
				) : null}
			</div>
		</WorkspaceShell>
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
