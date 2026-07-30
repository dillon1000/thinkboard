import {
	IconBrandSpotify,
	IconClock,
	IconFocus2,
	IconMessageCircle,
	IconRefresh,
	IconRoute,
	IconSparkles,
} from '@tabler/icons-react'
import { useLockIn } from './LockInProvider'
import {
	formatLockInTime,
	getLockInElapsedMS,
	getLockInRemainingMS,
} from './lib/lockInSession'

interface LockInPanelProps {
	onOpenStudyChat: () => void
}

export function LockInPanel({ onOpenStudyChat }: LockInPanelProps) {
	const {
		nextReviewAt,
		now,
		openSetup,
		requestReview,
		review,
		reviewError,
		reviewState,
		session,
	} = useLockIn()
	if (!session) return null

	const remainingMS = getLockInRemainingMS(session, now)
	const progress = Math.min(
		1,
		getLockInElapsedMS(session, now) / (session.durationMinutes * 60_000)
	)
	const nextReviewSeconds = nextReviewAt
		? Math.max(0, Math.ceil((nextReviewAt - now) / 1_000))
		: null
	const isReviewing = reviewState === 'capturing' || reviewState === 'reviewing'

	return (
		<div className="LockInPanel">
			<section className="LockInPanel-hero">
				<div className="LockInPanel-kicker">
					<span><i /> Focus session</span>
					<strong>{formatLockInTime(remainingMS)}</strong>
				</div>
				<h3>{session.goal}</h3>
				<div className="LockInPanel-finish">
					<span>Finish line</span>
					<p>{session.finishLine}</p>
				</div>
				<div
					aria-label={`${Math.round(progress * 100)}% of Lock In session elapsed`}
					aria-valuemax={100}
					aria-valuemin={0}
					aria-valuenow={Math.round(progress * 100)}
					className="LockInPanel-progress"
					role="progressbar"
				>
					<i style={{ transform: `scaleX(${progress})` }} />
				</div>
			</section>

			<section className="LockInPanel-coachSection">
				<header>
					<div>
						<span className={isReviewing ? 'is-reviewing' : undefined}>
							<IconSparkles aria-hidden="true" size={16} stroke={1.9} />
						</span>
						<div>
							<strong>Focus coach</strong>
							<small>
								{isReviewing
									? reviewState === 'capturing' ? 'Capturing your latest work…' : 'Comparing your progress…'
									: nextReviewSeconds === null ? 'Paused' : `Next look in ${formatCheckInTime(nextReviewSeconds)}`}
							</small>
						</div>
					</div>
					<button
						disabled={isReviewing || session.runningSince === null}
						onClick={() => void requestReview()}
						title="Review the canvas now"
						type="button"
					>
						<IconRefresh aria-hidden="true" size={14} />
						Check now
					</button>
				</header>

				<div
					aria-live="polite"
					className="LockInPanel-coach"
					data-state={review?.status ?? (reviewError ? 'error' : 'waiting')}
				>
					{reviewError ? (
						<>
							<span className="LockInPanel-status">Check-in missed</span>
							<h4>I couldn’t review this canvas yet.</h4>
							<p>{reviewError}</p>
						</>
					) : review ? (
						<>
							<span className="LockInPanel-status">{statusLabel(review.status)}</span>
							<h4>{review.headline}</h4>
							<p>{review.coach}</p>
							<small>{review.evidence}</small>
						</>
					) : (
						<>
							<span className="LockInPanel-status">Watching your direction</span>
							<h4>Your first check-in is queued.</h4>
							<p>I’ll compare the whole canvas with only the shapes you changed and give you one concrete next move.</p>
						</>
					)}
				</div>
			</section>

			<section className="LockInPanel-details">
				<div>
					<IconFocus2 aria-hidden="true" size={16} stroke={1.8} />
					<span>
						<strong>{session.scopeShapeIDs.length > 0 ? `${session.scopeShapeIDs.length} focused objects` : 'Whole space'}</strong>
						<small>Visual focus scope</small>
					</span>
				</div>
				<div>
					<IconRoute aria-hidden="true" size={16} stroke={1.8} />
					<span>
						<strong>{session.redirectWhenDrifting ? 'Coach + recenter' : 'Coach only'}</strong>
						<small>When AI detects drift</small>
					</span>
				</div>
				<div>
					<IconClock aria-hidden="true" size={16} stroke={1.8} />
					<span>
						<strong>Every {formatCheckInTime(session.reviewIntervalSeconds)}</strong>
						<small>Transient snapshot check</small>
					</span>
				</div>
				{session.playlistEnabled ? (
					<div>
						<IconBrandSpotify aria-hidden="true" size={16} />
						<span><strong>Playlist ready</strong><small>Current Spotify session</small></span>
					</div>
				) : null}
			</section>

			<p className="LockInPanel-privacy">Canvas snapshots are analyzed for this check-in and are not saved.</p>

			<footer className="LockInPanel-footer">
				<button className="LockInPanel-secondary" onClick={openSetup} type="button">
					Edit session
				</button>
				<button className="LockInPanel-primary" onClick={onOpenStudyChat} type="button">
					<IconMessageCircle aria-hidden="true" size={16} />
					Open Study chat
				</button>
			</footer>
		</div>
	)
}

function formatCheckInTime(seconds: number) {
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.ceil(seconds / 60)
	return `${minutes}m`
}

function statusLabel(status: 'on-track' | 'drifting' | 'stalled' | 'unclear' | 'complete') {
	switch (status) {
		case 'on-track':
			return 'On track'
		case 'drifting':
			return 'Redirecting your focus'
		case 'stalled':
			return 'Momentum paused'
		case 'unclear':
			return 'Need a clearer signal'
		case 'complete':
			return 'Goal complete'
	}
}
