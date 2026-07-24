import confetti from 'canvas-confetti'
import {
	IconArrowRight,
	IconTrophy,
} from '@tabler/icons-react'
import { useEffect } from 'react'
import { useLockIn } from './LockInProvider'

const CONFETTI_COLORS = ['#2383e2', '#54a3f0', '#448361', '#f2b84b', '#ffffff']

export function LockInCelebration() {
	const { completion, dismissCompletion } = useLockIn()

	useEffect(() => {
		if (!completion) return
		const options = {
			colors: CONFETTI_COLORS,
			disableForReducedMotion: true,
			zIndex: 1001,
		}
		void confetti({
			...options,
			origin: { x: 0.5, y: 0.72 },
			particleCount: 110,
			spread: 78,
			startVelocity: 48,
		})
		const sideBurst = window.setTimeout(() => {
			void confetti({
				...options,
				angle: 58,
				origin: { x: 0, y: 0.66 },
				particleCount: 55,
				spread: 62,
				startVelocity: 44,
			})
			void confetti({
				...options,
				angle: 122,
				origin: { x: 1, y: 0.66 },
				particleCount: 55,
				spread: 62,
				startVelocity: 44,
			})
		}, 180)
		const finalBurst = window.setTimeout(() => {
			void confetti({
				...options,
				origin: { x: 0.5, y: 0.44 },
				particleCount: 65,
				scalar: 0.84,
				spread: 110,
				startVelocity: 32,
			})
		}, 520)
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') dismissCompletion()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.clearTimeout(sideBurst)
			window.clearTimeout(finalBurst)
			window.removeEventListener('keydown', handleKeyDown)
			confetti.reset()
		}
	}, [completion, dismissCompletion])

	if (!completion) return null

	return (
		<div aria-labelledby="lock-in-complete-title" aria-modal="true" className="LockInCelebration" role="dialog">
			<div aria-hidden="true" className="LockInCelebration-aura" />
			<section className="LockInCelebration-card">
				<span className="LockInCelebration-icon">
					<IconTrophy aria-hidden="true" size={30} stroke={1.7} />
				</span>
				<p>Lock In complete</p>
				<h2 id="lock-in-complete-title">{completion.headline}</h2>
				<strong>{completion.goal}</strong>
				<div>
					<span>Finish line reached</span>
					<p>{completion.finishLine}</p>
				</div>
				<p className="LockInCelebration-coach">{completion.coach}</p>
				<small>{completion.evidence}</small>
				<button autoFocus onClick={dismissCompletion} type="button">
					Back to board
					<IconArrowRight aria-hidden="true" size={17} />
				</button>
			</section>
		</div>
	)
}
