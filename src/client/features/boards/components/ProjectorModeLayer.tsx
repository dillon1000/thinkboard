import {
	IconDeviceProjector,
	IconDeviceTablet,
	IconUnlink,
	IconX,
} from '@tabler/icons-react'
import {
	type FormEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from 'react'
import { useEditor, useValue } from 'tldraw'
import { useCurrentTime } from '../../../lib/browser/useCurrentTime'
import { useBoardChrome } from '../lib/BoardChromeProvider'
import { useProjectorMode } from '../lib/ProjectorModeProvider'
import {
	formatProjectorCode,
	formatProjectorTime,
	getProjectorClockHandAngles,
	isProjectorCode,
	normalizeProjectorCode,
	readProjectorPresenceMetadata,
} from '../lib/projectorMode'

const EXIT_HOLD_MS = 900
const EXIT_MOVE_TOLERANCE = 12

/**
 * Renders both ends of projector pairing inside tldraw's foreground layer. The projector blocks
 * local canvas input while it follows the controller, while the controller keeps full board use.
 */
export function ProjectorModeLayer() {
	const chrome = useBoardChrome()
	const editor = useEditor()
	const projector = useProjectorMode()
	const controllerUserID = useValue('projector controller', () => {
		if (!projector.projectorCode) return null
		const controller = editor.getCollaborators().find((presence) => {
			const metadata = readProjectorPresenceMetadata(presence.meta)
			return metadata?.mode === 'controller' && metadata.code === projector.projectorCode
		})
		return controller?.userId ?? null
	}, [editor, projector.projectorCode])
	const pairedProjector = useValue('paired projector', () => {
		if (!projector.controllerCode) return null
		return editor.getCollaborators().some((presence) => {
			const metadata = readProjectorPresenceMetadata(presence.meta)
			return metadata?.mode === 'projector' && metadata.code === projector.controllerCode
		})
	}, [editor, projector.controllerCode])

	useEffect(() => {
		if (!projector.enabled) return
		editor.updateInstanceState({ isReadonly: true })
		if (controllerUserID) editor.startFollowingUser(controllerUserID)
		else editor.stopFollowingUser()

		return () => {
			editor.stopFollowingUser()
			editor.updateInstanceState({ isReadonly: chrome.role === 'viewer' })
		}
	}, [chrome.role, controllerUserID, editor, projector.enabled])

	return (
		<>
			{projector.enabled && projector.projectorCode ? (
				<ProjectorDisplay
					code={projector.projectorCode}
					connected={Boolean(controllerUserID)}
					introVisible={projector.introVisible}
					onExit={projector.exit}
				/>
			) : null}
			{projector.pairingOpen ? (
				<ProjectorPairingDialog
					onClose={projector.closePairing}
					onPair={(code) => projector.setController(editor, code)}
				/>
			) : null}
			{projector.controllerCode && !projector.enabled ? (
				<div className="ProjectorControllerStatus" data-connected={Boolean(pairedProjector)}>
					<IconDeviceProjector aria-hidden="true" size={17} stroke={1.8} />
					<span>
						<strong>{pairedProjector ? 'Projector connected' : 'Waiting for projector'}</strong>
						<small>{formatProjectorCode(projector.controllerCode)}</small>
					</span>
					<button
						aria-label="Disconnect projector"
						onClick={projector.disconnectController}
						title="Disconnect projector"
						type="button"
					>
						<IconUnlink aria-hidden="true" size={16} stroke={1.8} />
					</button>
				</div>
			) : null}
		</>
	)
}

function ProjectorDisplay({
	code,
	connected,
	introVisible,
	onExit,
}: {
	code: string
	connected: boolean
	introVisible: boolean
	onExit: () => void
}) {
	const now = new Date(useCurrentTime(1_000))
	const clockHandAngles = getProjectorClockHandAngles(now)
	const holdTimerRef = useRef<number | null>(null)
	const holdOriginRef = useRef<{ x: number; y: number } | null>(null)

	function cancelExitHold() {
		if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
		holdTimerRef.current = null
		holdOriginRef.current = null
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.pointerType === 'mouse' && event.button !== 0) return
		cancelExitHold()
		holdOriginRef.current = { x: event.clientX, y: event.clientY }
		holdTimerRef.current = window.setTimeout(onExit, EXIT_HOLD_MS)
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		const origin = holdOriginRef.current
		if (
			origin &&
			Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > EXIT_MOVE_TOLERANCE
		) cancelExitHold()
	}

	return (
		<div
			aria-label="Projector mode"
			className="ProjectorModeLayer"
			data-intro={introVisible}
			onContextMenu={(event) => {
				event.preventDefault()
				onExit()
			}}
			onPointerCancel={cancelExitHold}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={cancelExitHold}
			role="application"
		>
			{introVisible ? (
				<div className="ProjectorIntro" role="status">
					<div aria-hidden="true" className="ProjectorIntro-aurora" />
					<h1>Welcome to Projector Mode</h1>
					<h2>Right Click or Hold to Exit</h2>
					<span aria-hidden="true" className="ProjectorIntro-spinner" />
				</div>
			) : (
				<>
					<div className="ProjectorClock">
						<span aria-hidden="true" className="ProjectorAnalogClock">
							<i
								className="ProjectorAnalogClock-hour"
								style={{ rotate: `${clockHandAngles.hour}deg` }}
							/>
							<i
								className="ProjectorAnalogClock-minute"
								style={{ rotate: `${clockHandAngles.minute}deg` }}
							/>
							<i className="ProjectorAnalogClock-pin" />
						</span>
						<time dateTime={now.toISOString()}>{formatProjectorTime(now)}</time>
					</div>
					{connected ? (
						<div className="ProjectorConnected" role="status">
							<span aria-hidden="true" />
							iPad connected
						</div>
					) : (
						<div className="ProjectorPairingCard" role="status">
							<span className="ProjectorPairingCard-icon">
								<IconDeviceTablet aria-hidden="true" size={32} stroke={1.45} />
							</span>
							<p>Pair an iPad from this space</p>
							<strong>{formatProjectorCode(code)}</strong>
							<small>Open View, then choose Control projector.</small>
							<button
								onClick={onExit}
								onPointerDown={(event) => event.stopPropagation()}
								type="button"
							>
								Exit Projector Mode
							</button>
						</div>
					)}
				</>
			)}
		</div>
	)
}

function ProjectorPairingDialog({
	onClose,
	onPair,
}: {
	onClose: () => void
	onPair: (code: string) => void
}) {
	const editor = useEditor()
	const [code, setCode] = useState('')
	const [error, setError] = useState<string | null>(null)

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const normalizedCode = normalizeProjectorCode(code)
		if (!isProjectorCode(normalizedCode)) {
			setError('Enter the six-digit code shown on the projector.')
			return
		}

		const projectorIsAvailable = editor.getCollaborators().some((presence) => {
			const metadata = readProjectorPresenceMetadata(presence.meta)
			return metadata?.mode === 'projector' && metadata.code === normalizedCode
		})
		if (!projectorIsAvailable) {
			setError('No projector with that code is available in this space.')
			return
		}

		onPair(normalizedCode)
	}

	return (
		<div className="ProjectorPairingBackdrop">
			<form
				aria-describedby={error ? 'projector-pairing-error' : 'projector-pairing-help'}
				aria-labelledby="projector-pairing-title"
				aria-modal="true"
				className="ProjectorPairingDialog"
				onSubmit={handleSubmit}
				role="dialog"
			>
				<header>
					<span><IconDeviceProjector aria-hidden="true" size={24} stroke={1.6} /></span>
					<div>
						<h2 id="projector-pairing-title">Control a projector</h2>
						<p id="projector-pairing-help">Your iPad camera will become the projected view.</p>
					</div>
					<button aria-label="Close" onClick={onClose} type="button">
						<IconX aria-hidden="true" size={19} stroke={1.8} />
					</button>
				</header>
				<label>
					<span>Projector code</span>
					<input
						autoFocus
						inputMode="numeric"
						maxLength={7}
						onChange={(event) => {
							setCode(formatProjectorCode(event.target.value))
							setError(null)
						}}
						placeholder="000 000"
						value={code}
					/>
				</label>
				{error ? <p className="ProjectorPairingDialog-error" id="projector-pairing-error" role="alert">{error}</p> : null}
				<footer>
					<button className="ProjectorPairingDialog-cancel" onClick={onClose} type="button">Cancel</button>
					<button className="ProjectorPairingDialog-submit" type="submit">Pair iPad</button>
				</footer>
			</form>
		</div>
	)
}
