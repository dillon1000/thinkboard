import { DEFAULT_LOCK_IN_REVIEW_INTERVAL_SECONDS } from '@agentboard/shared'
import {
	IconBrandSpotify,
	IconCheck,
	IconChevronDown,
	IconClock,
	IconFocus2,
	IconLock,
	IconRoute,
	IconSparkles,
	IconX,
} from '@tabler/icons-react'
import { type FormEvent, useState } from 'react'
import { useLockIn } from './LockInProvider'
import {
	LOCK_IN_DURATION_OPTIONS,
	LOCK_IN_REVIEW_INTERVAL_OPTIONS,
	type LockInConfig,
} from './lib/lockInSession'

export function LockInSetup() {
	const { isSetupOpen } = useLockIn()
	return isSetupOpen ? <LockInSetupForm /> : null
}

function LockInSetupForm() {
	const {
		closeSetup,
		currentSelectionIDs,
		session,
		startSession,
		updateSession,
	} = useLockIn()
	const [goal, setGoal] = useState(session?.goal ?? '')
	const [finishLine, setFinishLine] = useState(session?.finishLine ?? '')
	const [durationMinutes, setDurationMinutes] = useState(session?.durationMinutes ?? 45)
	const [useSelection, setUseSelection] = useState(
		session ? session.scopeShapeIDs.length > 0 : currentSelectionIDs.length > 0
	)
	const [redirectWhenDrifting, setRedirectWhenDrifting] = useState(
		session?.redirectWhenDrifting ?? true
	)
	const [reviewIntervalSeconds, setReviewIntervalSeconds] = useState(
		session?.reviewIntervalSeconds ?? DEFAULT_LOCK_IN_REVIEW_INTERVAL_SECONDS
	)
	const [playlistEnabled, setPlaylistEnabled] = useState(session?.playlistEnabled ?? false)

	const availableScopeIDs = currentSelectionIDs.length > 0
		? currentSelectionIDs
		: session?.scopeShapeIDs ?? []
	const canSubmit = goal.trim().length > 0 && finishLine.trim().length > 0

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!canSubmit) return
		const config: LockInConfig = {
			durationMinutes,
			finishLine: finishLine.trim(),
			goal: goal.trim(),
			playlistEnabled,
			redirectWhenDrifting,
			reviewIntervalSeconds,
			scopeShapeIDs: useSelection ? availableScopeIDs : [],
		}
		if (session) updateSession(config)
		else startSession(config)
	}

	return (
		<>
			<button aria-label="Close Lock In setup" className="LockInSetup-scrim" onClick={closeSetup} type="button" />
			<aside aria-label="Lock In setup" className="LockInSetup">
				<header className="LockInSetup-header">
					<span><IconLock aria-hidden="true" size={18} stroke={1.8} /></span>
					<div>
						<h2>Lock In</h2>
						<p>Define the finish line before you start.</p>
					</div>
					<button aria-label="Close Lock In setup" onClick={closeSetup} title="Close" type="button"><IconX aria-hidden="true" size={17} /></button>
				</header>
				<form className="LockInSetup-form" onSubmit={submit}>
					<label className="LockInField">
						<span>What will you finish?</span>
						<input
							autoFocus
							maxLength={120}
							onChange={(event) => setGoal(event.target.value)}
							placeholder="Draft the elasticity explanation"
							value={goal}
						/>
					</label>
					<label className="LockInField">
						<span>Done looks like</span>
						<textarea
							maxLength={200}
							onChange={(event) => setFinishLine(event.target.value)}
							placeholder="A 150-word answer with one labeled graph"
							rows={3}
							value={finishLine}
						/>
						<small>{finishLine.length}/200</small>
					</label>

					<div className="LockInSetup-row">
						<label className="LockInSelect">
							<span>Duration</span>
							<div>
								<IconClock aria-hidden="true" size={17} stroke={1.8} />
								<select onChange={(event) => setDurationMinutes(Number(event.target.value))} value={durationMinutes}>
									{LOCK_IN_DURATION_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
								</select>
								<IconChevronDown aria-hidden="true" size={14} />
							</div>
						</label>
						<label className="LockInSelect">
							<span>AI check-ins</span>
							<div>
								<IconSparkles aria-hidden="true" size={17} stroke={1.8} />
								<select
									onChange={(event) => setReviewIntervalSeconds(Number(event.target.value))}
									value={reviewIntervalSeconds}
								>
									{LOCK_IN_REVIEW_INTERVAL_OPTIONS.map((seconds) => (
										<option key={seconds} value={seconds}>
											{seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`}
										</option>
									))}
								</select>
								<IconChevronDown aria-hidden="true" size={14} />
							</div>
						</label>
					</div>

					<label className="LockInChoice">
						<input
							checked={useSelection}
							disabled={availableScopeIDs.length === 0}
							onChange={(event) => setUseSelection(event.target.checked)}
							type="checkbox"
						/>
						<span className="LockInChoice-check"><IconCheck aria-hidden="true" size={13} stroke={2.4} /></span>
						<IconFocus2 aria-hidden="true" size={17} stroke={1.8} />
						<span>
							<strong>Use current selection as my focus scope</strong>
							<small>{availableScopeIDs.length > 0 ? `${availableScopeIDs.length} object${availableScopeIDs.length === 1 ? '' : 's'}` : 'Select canvas objects first, or focus on the whole space'}</small>
						</span>
					</label>

					<label className="LockInSelect LockInSelect--wide">
						<span>How should Thinkspace support you?</span>
						<div>
							<IconRoute aria-hidden="true" size={17} stroke={1.8} />
							<select onChange={(event) => setRedirectWhenDrifting(event.target.value === 'redirect')} value={redirectWhenDrifting ? 'redirect' : 'quiet'}>
								<option value="redirect">Coach me and recenter when I drift</option>
								<option value="quiet">Coach me without recentering</option>
							</select>
							<IconChevronDown aria-hidden="true" size={14} />
						</div>
					</label>

					<label className="LockInChoice">
						<input checked={playlistEnabled} onChange={(event) => setPlaylistEnabled(event.target.checked)} type="checkbox" />
						<span className="LockInChoice-check"><IconCheck aria-hidden="true" size={13} stroke={2.4} /></span>
						<span className="LockInChoice-spotify"><IconBrandSpotify aria-hidden="true" size={17} /></span>
						<span>
							<strong>Focus playlist</strong>
							<small>Keep your current Spotify session close by</small>
						</span>
					</label>

					<div className="LockInSetup-footer">
						<button className="LockInSetup-submit" disabled={!canSubmit} type="submit">
							<IconLock aria-hidden="true" size={16} stroke={2} />
							{session ? 'Save Lock In changes' : `Lock in for ${durationMinutes} min`}
						</button>
						<p>AI check-ins compare transient canvas snapshots. Images are not saved.</p>
					</div>
				</form>
			</aside>
		</>
	)
}
