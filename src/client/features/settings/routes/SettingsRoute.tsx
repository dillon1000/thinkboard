import {
	SPOTIFY_SCOPES,
	apiRoutes,
	appRoutes,
	type PublicConfig,
} from '@agentboard/shared'
import {
	IconBrandSpotify,
	IconCards,
	IconCheck,
	IconExternalLink,
	IconFocusCentered,
	IconLock,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { WorkspaceShell } from '../../auth/components/WorkspaceShell'
import { apiRequest } from '../../../lib/api'
import { authClient } from '../../../lib/authClient'
import {
	readSpotifyStatusVisibility,
	writeSpotifyStatusVisibility,
} from '../../spotify/lib/spotifyPreferences'
import {
	readDueReviewVisibility,
	writeDueReviewVisibility,
} from '../../boards/lib/dueReviewPreferences'
import {
	readRadialMenuAlwaysOn,
	writeRadialMenuAlwaysOn,
} from '../../boards/lib/radialMenuPreference'
import {
	readBoardFlashcardDirectReveal,
	writeBoardFlashcardDirectReveal,
} from '../../study/lib/boardFlashcardPreferences'
import { CraftConnectionCard } from '../components/CraftConnectionCard'

export function Component() {
	const [config, setConfig] = useState<PublicConfig | null>(null)
	const [isSpotifyConnected, setIsSpotifyConnected] = useState(false)
	const [spotifyScopes, setSpotifyScopes] = useState<string[]>([])
	const [showSpotifyStatus, setShowSpotifyStatus] = useState(readSpotifyStatusVisibility)
	const [showDueReviews, setShowDueReviews] = useState(readDueReviewVisibility)
	const [radialMenuAlwaysOn, setRadialMenuAlwaysOn] = useState(readRadialMenuAlwaysOn)
	const [boardFlashcardDirectReveal, setBoardFlashcardDirectReveal] = useState(
		readBoardFlashcardDirectReveal
	)
	const [isLoading, setIsLoading] = useState(true)
	const [isLinking, setIsLinking] = useState(false)
	const [isUnlinking, setIsUnlinking] = useState(false)
	const [error, setError] = useState<string | null>(getOAuthCallbackError)

	useEffect(() => {
		void loadConnections()
	}, [])

	async function loadConnections() {
		setIsLoading(true)
		try {
			const [publicConfig, accountsResult] = await Promise.all([
				apiRequest<PublicConfig>(apiRoutes.config),
				authClient.listAccounts(),
			])
			if (accountsResult.error) {
				throw new Error(accountsResult.error.message ?? 'Unable to load connected accounts')
			}
			setConfig(publicConfig)
			const spotifyAccount = accountsResult.data?.find(({ providerId }) => providerId === 'spotify')
			setIsSpotifyConnected(Boolean(spotifyAccount))
			setSpotifyScopes(spotifyAccount?.scopes ?? [])
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load connections')
		} finally {
			setIsLoading(false)
		}
	}

	async function connectSpotify() {
		setError(null)
		setIsLinking(true)
		const result = await authClient.linkSocial({
			callbackURL: `${appRoutes.settings}?spotify=connected`,
			errorCallbackURL: `${appRoutes.settings}?spotify=error`,
			provider: 'spotify',
			scopes: [...SPOTIFY_SCOPES],
		})

		if (result.error) {
			setError(result.error.message ?? 'Unable to connect Spotify')
			setIsLinking(false)
		}
	}

	async function disconnectSpotify() {
		if (!window.confirm('Disconnect Spotify from Agentboard? The canvas player will stop working until you reconnect it.')) return

		setError(null)
		setIsUnlinking(true)
		const result = await authClient.unlinkAccount({ providerId: 'spotify' })
		if (result.error) {
			setError(result.error.message ?? 'Unable to disconnect Spotify')
		} else {
			setIsSpotifyConnected(false)
			setSpotifyScopes([])
		}
		setIsUnlinking(false)
	}

	const spotifyConfigured = Boolean(config?.spotify.enabled)
	const needsSpotifyScopeUpdate = isSpotifyConnected
		&& SPOTIFY_SCOPES.some((scope) => !spotifyScopes.includes(scope))
	const spotifyStatus = isLoading
		? 'Checking…'
		: !spotifyConfigured
			? 'Unavailable'
			: needsSpotifyScopeUpdate
				? 'Update needed'
				: isSpotifyConnected
				? 'Connected'
				: 'Not connected'

	return (
		<WorkspaceShell activePage="settings" skipTargetID="settings-content" title="Settings">
			<div className="Settings-content" id="settings-content">
				<header className="Settings-heading">
					<h1>Settings</h1>
					<p>Manage the services Agentboard can use alongside your study tools.</p>
				</header>

				{error ? <p className="FormError Settings-error" role="alert">{error}</p> : null}

				<section aria-labelledby="connections-heading" className="Settings-section">
					<div className="Settings-sectionHeading">
						<h2 id="connections-heading">Connections</h2>
						<p>Linked accounts stay private to you and can be disconnected here.</p>
					</div>

					<div className="ConnectionList">
						<article className="ConnectionCard">
							<div className="ConnectionCard-icon ConnectionCard-icon--identity">
								<IconLock aria-hidden="true" size={19} stroke={1.8} />
							</div>
							<div className="ConnectionCard-copy">
								<div>
									<h3>{config?.oAuth.providerName ?? 'Organization account'}</h3>
									<span className="ConnectionStatus ConnectionStatus--connected">
										<IconCheck aria-hidden="true" size={12} stroke={2.2} /> Connected
									</span>
								</div>
								<p>Your primary sign-in for Agentboard.</p>
							</div>
							<span className="ConnectionCard-primary">Primary</span>
						</article>

						<article className="ConnectionCard">
							<div className="ConnectionCard-icon ConnectionCard-icon--spotify">
								<IconBrandSpotify aria-hidden="true" size={22} stroke={1.8} />
							</div>
							<div className="ConnectionCard-copy">
								<div>
									<h3>Spotify</h3>
									<span className={`ConnectionStatus${isSpotifyConnected && !needsSpotifyScopeUpdate ? ' ConnectionStatus--connected' : ''}`}>
										{isSpotifyConnected && !needsSpotifyScopeUpdate ? <IconCheck aria-hidden="true" size={12} stroke={2.2} /> : null}
										{spotifyStatus}
									</span>
								</div>
								<p>See what’s playing and control your active Spotify device from a board.</p>
								{spotifyConfigured ? (
									<small>Allows Agentboard and your study partner to read playback, find music, and play, pause, or skip tracks.</small>
								) : (
									<small>Add Spotify app credentials to the Worker environment to enable this connection.</small>
								)}
								<label className="SpotifyPreference">
									<span>
										<strong>Show Spotify status on boards</strong>
										<small>Hide the player without disconnecting your account.</small>
									</span>
									<input
										checked={showSpotifyStatus}
										onChange={(event) => {
											setShowSpotifyStatus(event.target.checked)
											writeSpotifyStatusVisibility(event.target.checked)
										}}
										type="checkbox"
									/>
									<span aria-hidden="true" className="SpotifyPreference-control"><span /></span>
								</label>
							</div>
							<div className="ConnectionCard-action">
								{isSpotifyConnected ? (
									<>
										{needsSpotifyScopeUpdate ? (
											<button className="Button Button--spotify" disabled={isLinking || isLoading} onClick={() => void connectSpotify()} type="button">
												{isLinking ? 'Opening Spotify…' : 'Update access'}
											</button>
										) : null}
										<button className="Button ConnectionButton--danger" disabled={isUnlinking} onClick={() => void disconnectSpotify()} type="button">
											{isUnlinking ? 'Disconnecting…' : 'Disconnect'}
										</button>
									</>
								) : (
									<button className="Button Button--spotify" disabled={!spotifyConfigured || isLinking || isLoading} onClick={() => void connectSpotify()} type="button">
										<IconBrandSpotify aria-hidden="true" size={16} stroke={2} />
										{isLinking ? 'Opening Spotify…' : 'Connect'}
									</button>
								)}
							</div>
						</article>

						<CraftConnectionCard />
					</div>

					<a className="Settings-docLink" href="https://www.spotify.com/account/apps/" rel="noreferrer" target="_blank">
						Manage authorized apps on Spotify <IconExternalLink aria-hidden="true" size={13} stroke={1.8} />
					</a>
				</section>

				<section aria-labelledby="homepage-heading" className="Settings-section">
					<div className="Settings-sectionHeading">
						<h2 id="homepage-heading">Homepage</h2>
						<p>Choose which study tools appear above your recent boards.</p>
					</div>

					<div className="ConnectionList">
						<article className="ConnectionCard">
							<div className="ConnectionCard-icon ConnectionCard-icon--identity">
								<IconCards aria-hidden="true" size={20} stroke={1.8} />
							</div>
							<div className="ConnectionCard-copy">
								<div>
									<h3>Due Today reviews</h3>
								</div>
								<p>Show due flashcards in a horizontal row on your homepage.</p>
								<label className="SpotifyPreference">
									<span>
										<strong>Show on homepage</strong>
										<small>Turn this on to restore the section after hiding it.</small>
									</span>
									<input
										checked={showDueReviews}
										onChange={(event) => {
											setShowDueReviews(event.target.checked)
											writeDueReviewVisibility(event.target.checked)
										}}
										type="checkbox"
									/>
									<span aria-hidden="true" className="SpotifyPreference-control"><span /></span>
								</label>
							</div>
						</article>
					</div>
				</section>

				<section aria-labelledby="canvas-heading" className="Settings-section">
					<div className="Settings-sectionHeading">
						<h2 id="canvas-heading">Canvas</h2>
						<p>Choose how board controls and study cards behave while you work.</p>
					</div>

					<div className="ConnectionList">
						<article className="ConnectionCard">
							<div className="ConnectionCard-icon ConnectionCard-icon--identity">
								<IconCards aria-hidden="true" size={20} stroke={1.8} />
							</div>
							<div className="ConnectionCard-copy">
								<div>
									<h3>Board flashcards</h3>
								</div>
								<p>Choose what happens when you click a compact flashcard on a board.</p>
								<label className="SpotifyPreference">
									<span>
										<strong>Reveal answers immediately</strong>
										<small>Skip the answering UI and show the answer on the card.</small>
									</span>
									<input
										checked={boardFlashcardDirectReveal}
										onChange={(event) => {
											setBoardFlashcardDirectReveal(event.target.checked)
											writeBoardFlashcardDirectReveal(event.target.checked)
										}}
										type="checkbox"
									/>
									<span aria-hidden="true" className="SpotifyPreference-control"><span /></span>
								</label>
							</div>
						</article>

						<article className="ConnectionCard">
							<div className="ConnectionCard-icon ConnectionCard-icon--identity">
								<IconFocusCentered aria-hidden="true" size={20} stroke={1.8} />
							</div>
							<div className="ConnectionCard-copy">
								<div>
									<h3>Press-and-hold menu</h3>
								</div>
								<p>Press and hold anywhere on a board — cursor, touch or pen — to open a quick menu of tools, colours, chat, PDF import and music.</p>
								<small>Always available in Zen Mode. Turn this on to use it on any board, even with the toolbars showing.</small>
								<label className="SpotifyPreference">
									<span>
										<strong>Enable outside Zen Mode</strong>
										<small>Summon the menu without hiding the rest of the interface.</small>
									</span>
									<input
										checked={radialMenuAlwaysOn}
										onChange={(event) => {
											setRadialMenuAlwaysOn(event.target.checked)
											writeRadialMenuAlwaysOn(event.target.checked)
										}}
										type="checkbox"
									/>
									<span aria-hidden="true" className="SpotifyPreference-control"><span /></span>
								</label>
							</div>
						</article>
					</div>
				</section>
			</div>
		</WorkspaceShell>
	)
}

function getOAuthCallbackError() {
	return new URLSearchParams(window.location.search).get('spotify') === 'error'
		? 'Spotify did not finish connecting. Please try again.'
		: null
}
