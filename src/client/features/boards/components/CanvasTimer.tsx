import {
	IconClock,
	IconPlayerPause,
	IconPlayerPlay,
	IconRefresh,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { formatCanvasTimerTime } from '../lib/canvasTimer'

interface CanvasTimerState {
	elapsedMS: number
	runningSince: number | null
}

const INITIAL_TIMER_STATE: CanvasTimerState = {
	elapsedMS: 0,
	runningSince: null,
}

export function CanvasTimer() {
	const [now, setNow] = useState(Date.now)
	const [timer, setTimer] = useState<CanvasTimerState>(INITIAL_TIMER_STATE)
	const isRunning = timer.runningSince !== null
	const elapsedMS = timer.elapsedMS + (
		timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince)
	)
	const time = formatCanvasTimerTime(elapsedMS)

	useEffect(() => {
		if (!isRunning) return

		const updateNow = () => setNow(Date.now())
		updateNow()
		const interval = window.setInterval(updateNow, 250)
		return () => window.clearInterval(interval)
	}, [isRunning])

	function toggleTimer() {
		const timestamp = Date.now()
		setNow(timestamp)
		setTimer((current) => {
			if (current.runningSince === null) {
				return { ...current, runningSince: timestamp }
			}

			return {
				elapsedMS: current.elapsedMS + Math.max(0, timestamp - current.runningSince),
				runningSince: null,
			}
		})
	}

	function resetTimer() {
		setNow(Date.now())
		setTimer(INITIAL_TIMER_STATE)
	}

	const toggleLabel = isRunning ? 'Pause timer' : elapsedMS > 0 ? 'Resume timer' : 'Start timer'

	return (
		<div aria-label="Canvas timer" className="CanvasIsland CanvasTimer" role="group">
			<div aria-label={`${time} elapsed`} className="CanvasTimer-readout" role="timer">
				<IconClock aria-hidden="true" size={15} stroke={1.8} />
				<span>{time}</span>
			</div>
			<button
				aria-label={toggleLabel}
				className="CanvasIsland-button"
				data-active={isRunning}
				onClick={toggleTimer}
				title={toggleLabel}
				type="button"
			>
				{isRunning
					? <IconPlayerPause aria-hidden="true" size={15} />
					: <IconPlayerPlay aria-hidden="true" size={15} />}
			</button>
			<button
				aria-label="Reset timer"
				className="CanvasIsland-button"
				disabled={elapsedMS === 0}
				onClick={resetTimer}
				title="Reset timer"
				type="button"
			>
				<IconRefresh aria-hidden="true" size={15} />
			</button>
		</div>
	)
}
