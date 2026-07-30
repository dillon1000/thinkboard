import type { PublicConfig } from '@agentboard/shared'
import { apiRoutes, appRoutes } from '@agentboard/shared'
import {
	IconArrowRight,
	IconBrandOauth,
	IconLock,
	IconSettings,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ThinkspaceWordmark } from '../../../components/ThinkspaceWordmark'
import { apiRequest } from '../../../lib/api'
import { authClient } from '../../../lib/authClient'
import { ThemeToggle } from '../../theme/ThemeToggle'

export function Component() {
	const [config, setConfig] = useState<PublicConfig | null>(null)
	const [configError, setConfigError] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isStarting, setIsStarting] = useState(false)
	const session = authClient.useSession()
	const location = useLocation()

	useEffect(() => {
		void apiRequest<PublicConfig>(apiRoutes.config)
			.then(setConfig)
			.catch(() => setConfigError(true))
	}, [])

	if (!session.isPending && session.data) return <Navigate replace to={appRoutes.home} />

	async function handleOAuth() {
		if (!config?.oAuth.enabled) return
		setError(null)
		setIsStarting(true)

		const result = await authClient.signIn.oauth2({
			providerId: config.oAuth.providerID,
			callbackURL: getReturnPath(location.state),
			errorCallbackURL: appRoutes.login,
		})

		if (result.error) {
			setError(result.error.message ?? 'Unable to start secure sign-in')
			setIsStarting(false)
		}
	}

	const isLoading = !config && !configError

	return (
		<main className="AuthPage">
			<ThemeToggle className="ThemeToggle--corner" />
			<section className="AuthCard" aria-labelledby="sign-in-heading">
				<a className="Wordmark" href={appRoutes.home}>
					<ThinkspaceWordmark />
				</a>

				<div className="AuthCard-copy">
					<h1 id="sign-in-heading">Sign In to Thinkspace</h1>
					<p>Open your boards and continue where you left off.</p>
				</div>
				<div className="AuthRule" aria-hidden="true" />

				{config?.oAuth.enabled ? (
					<button
						className="Button Button--oauth"
						disabled={isStarting}
						onClick={() => void handleOAuth()}
						type="button"
					>
						<IconBrandOauth aria-hidden="true" size={19} stroke={1.8} />
						<span>{isStarting ? 'Opening Secure Sign-In…' : `Continue with ${config.oAuth.providerName}`}</span>
						<IconArrowRight aria-hidden="true" size={18} stroke={1.8} />
					</button>
				) : isLoading ? (
					<div className="AuthLoading" role="status"><span /> Loading Sign-In…</div>
				) : configError ? (
					<div className="AuthSetup" role="alert">
						<IconSettings aria-hidden="true" size={19} stroke={1.8} />
						<div>
							<strong>Sign-In Is Unavailable</strong>
							<p>Reload the page to try loading the provider again.</p>
						</div>
					</div>
				) : (
					<div className="AuthSetup" role="status">
						<IconSettings aria-hidden="true" size={19} stroke={1.8} />
						<div>
							<strong>OAuth Is Not Configured</strong>
							<p>Add your provider credentials to enable sign-in.</p>
						</div>
					</div>
				)}

				{error ? <p className="FormError" role="alert">{error}</p> : null}

				<p className="AuthFootnote">
					<IconLock aria-hidden="true" size={14} stroke={1.8} />
					Secure sign-in through your organization’s identity provider.
				</p>
			</section>
		</main>
	)
}

function getReturnPath(state: unknown) {
	if (!state || typeof state !== 'object') return appRoutes.home
	const from = Reflect.get(state, 'from')
	return typeof from === 'string' && from.startsWith('/') ? from : appRoutes.home
}
