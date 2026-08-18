import {
	craftAPIRoutes,
	craftConnectionStatusSchema,
	type CraftConnectionStatus,
} from '@agentboard/shared'
import {
	IconBrandCraft,
	IconCheck,
	IconExternalLink,
} from '@tabler/icons-react'
import { useState, type FormEvent } from 'react'
import { apiRequest } from '../../../lib/api'
import './craftConnection.css'

const DISCONNECTED_STATUS: CraftConnectionStatus = {
	connected: false,
	connectedAt: null,
	spaceName: null,
}

interface CraftConnectionCardProps {
	initialError: string | null
	initialStatus: CraftConnectionStatus
}

export function CraftConnectionCard({ initialError, initialStatus }: CraftConnectionCardProps) {
	const [status, setStatus] = useState(initialStatus)
	const [apiURL, setAPIURL] = useState('')
	const [error, setError] = useState(initialError)
	const [isSaving, setIsSaving] = useState(false)
	const [isDisconnecting, setIsDisconnecting] = useState(false)

	async function connect(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setError(null)
		setIsSaving(true)
		try {
			const nextStatus = await apiRequest(craftAPIRoutes.connection, {
				body: JSON.stringify({ apiURL }),
				method: 'PUT',
			}, craftConnectionStatusSchema)
			setStatus(nextStatus)
			setAPIURL('')
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setIsSaving(false)
		}
	}

	async function disconnect() {
		if (!window.confirm('Disconnect Craft from Thinkspace? Linked documents will stay in spaces, but Thinkspace cannot read them until you reconnect.')) return
		setError(null)
		setIsDisconnecting(true)
		try {
			await apiRequest(craftAPIRoutes.connection, { method: 'DELETE' })
			setStatus(DISCONNECTED_STATUS)
		} catch (caught) {
			setError(getErrorMessage(caught))
		} finally {
			setIsDisconnecting(false)
		}
	}

	const statusLabel = status.connected
			? 'Connected'
			: 'Not connected'

	return (
		<article className="ConnectionCard CraftConnection">
			<div className="ConnectionCard-icon CraftConnection-icon">
				<IconBrandCraft aria-hidden="true" size={22} stroke={1.8} />
			</div>
			<div className="ConnectionCard-copy">
				<div>
					<h3>Craft</h3>
					<span className={`ConnectionStatus${status.connected ? ' ConnectionStatus--connected' : ''}`}>
						{status.connected ? <IconCheck aria-hidden="true" size={12} stroke={2.2} /> : null}
						{statusLabel}
					</span>
				</div>
				<p>Link Craft documents to a space so your study partner can read and cite live notes.</p>
				{status.connected ? (
					<small>Connected to {status.spaceName}. Document changes are available only when you ask for them.</small>
				) : (
					<small>Create an API connection in Craft, then paste its full API URL here.</small>
				)}
				{error ? <p className="CraftConnection-error" role="alert">{error}</p> : null}
				{!status.connected ? (
					<form className="CraftConnection-form" onSubmit={(event) => void connect(event)}>
						<label>
							<span className="sr-only">Craft API URL</span>
							<input
								autoComplete="off"
								disabled={isSaving}
								onChange={(event) => setAPIURL(event.target.value)}
								placeholder="https://connect.craft.do/link/…/api/v1"
								spellCheck={false}
								type="password"
								value={apiURL}
							/>
						</label>
						<button className="Button" disabled={!apiURL.trim() || isSaving} type="submit">
							{isSaving ? 'Connecting…' : 'Connect'}
						</button>
					</form>
				) : null}
				<a href="https://support.craft.do/en/integrate/api" rel="noreferrer" target="_blank">
					Open Craft API help <IconExternalLink aria-hidden="true" size={12} stroke={1.8} />
				</a>
			</div>
			{status.connected ? (
				<div className="ConnectionCard-action">
					<button
						className="Button ConnectionButton--danger"
						disabled={isDisconnecting}
						onClick={() => void disconnect()}
						type="button"
					>
						{isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
					</button>
				</div>
			) : null}
		</article>
	)
}

function getErrorMessage<ErrorValue>(error: ErrorValue) {
	return error instanceof Error ? error.message : 'Craft could not connect.'
}
