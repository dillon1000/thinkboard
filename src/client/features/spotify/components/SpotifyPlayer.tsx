import {
	apiRoutes,
	appRoutes,
	spotifyPlayerResponseSchema,
	type SpotifyPlaybackAction,
	type SpotifyPlayerResponse,
} from '@agentboard/shared'
import {
	IconAlertCircle,
	IconBrandSpotify,
	IconPlayerPauseFilled,
	IconPlayerPlayFilled,
	IconPlayerSkipBackFilled,
	IconPlayerSkipForwardFilled,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'
import { apiRequest } from '../../../lib/api'
import { useCurrentTime } from '../../../lib/browser/useCurrentTime'
import {
	useSpotifyStatusVisibility,
} from '../lib/spotifyPreferences'

const PLAYER_REFRESH_INTERVAL_MS = 12_000

export function SpotifyPlayer() {
	return useSpotifyStatusVisibility() ? <SpotifyPlayerContent /> : null
}

function SpotifyPlayerContent() {
	const [player, setPlayer] = useState<SpotifyPlayerResponse | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isActing, setIsActing] = useState(false)
	const [lastSyncedAt, setLastSyncedAt] = useState(Date.now())
	const now = useCurrentTime(1_000, Boolean(player?.playback?.isPlaying))

	useEffect(() => {
		let isActive = true

		const load = async () => {
			try {
				const response = await apiRequest(
					apiRoutes.spotifyPlayer,
					undefined,
					spotifyPlayerResponseSchema
				)
				if (!isActive) return
				setPlayer(response)
				setLastSyncedAt(Date.now())
				setError(null)
			} catch (loadError) {
				if (!isActive) return
				setError(loadError instanceof Error ? loadError.message : 'Unable to reach Spotify')
			}
		}
		const refreshWhenVisible = () => {
			if (document.visibilityState === 'visible') void load()
		}

		void load()
		const refreshInterval = window.setInterval(() => void load(), PLAYER_REFRESH_INTERVAL_MS)
		document.addEventListener('visibilitychange', refreshWhenVisible)
		return () => {
			isActive = false
			window.clearInterval(refreshInterval)
			document.removeEventListener('visibilitychange', refreshWhenVisible)
		}
	}, [])

	async function sendAction(action: SpotifyPlaybackAction) {
		if (isActing) return
		setIsActing(true)
		setError(null)

		if (action === 'play' || action === 'pause') {
			setPlayer((current) => current?.playback
				? {
						...current,
						playback: {
							...current.playback,
							isPlaying: action === 'play',
						},
					}
				: current)
			setLastSyncedAt(Date.now())
		}

		try {
			await apiRequest(apiRoutes.spotifyPlayer, {
				body: JSON.stringify({ action }),
				method: 'POST',
			}, z.object({ ok: z.literal(true) }))
		} catch (actionError) {
			setError(actionError instanceof Error ? actionError.message : 'Unable to control Spotify')
		} finally {
			setIsActing(false)
		}
	}

	if (player && (!player.configured || !player.connected)) {
		return (
			<div className="SpotifyPlayer SpotifyPlayer--setup" title={player.configured ? 'Connect Spotify' : 'Spotify is not configured'}>
				<Link aria-label="Open Spotify connection settings" to={appRoutes.settings}>
					<IconBrandSpotify aria-hidden="true" size={19} stroke={1.9} />
				</Link>
			</div>
		)
	}

	const playback = player?.playback ?? null
	const item = playback?.item ?? null
	const durationMS = item?.durationMS ?? 0
	const elapsedSinceSync = playback?.isPlaying ? Math.max(0, now - lastSyncedAt) : 0
	const progressMS = Math.min(durationMS, (playback?.progressMS ?? 0) + elapsedSinceSync)
	const progressPercent = durationMS > 0 ? progressMS / durationMS * 100 : 0

	return (
		<div className={`SpotifyPlayer${item ? '' : ' SpotifyPlayer--idle'}`} data-loading={!player}>
			{error ? (
				<div className="SpotifyPlayer-notice" role="alert">
					<IconAlertCircle aria-hidden="true" size={14} stroke={1.9} />
					<span>{error}</span>
				</div>
			) : null}
			<div className="SpotifyPlayer-art" aria-hidden="true">
				{item?.albumImageURL
					? <img alt="" src={item.albumImageURL} />
					: <IconBrandSpotify size={19} stroke={1.9} />}
			</div>
			<div className="SpotifyPlayer-copy">
				{item?.externalURL ? (
					<a href={item.externalURL} rel="noreferrer" target="_blank" title={`${item.title} — ${item.subtitle}`}>
						<strong>{item.title}</strong>
						<span>{item.subtitle || playback?.device.name}</span>
					</a>
				) : (
					<div>
						<strong>{player ? 'Nothing playing' : 'Opening Spotify…'}</strong>
						<span>{player ? 'Start playback on any device' : 'Checking your player'}</span>
					</div>
				)}
				<span className="SpotifyPlayer-progress" role="progressbar" aria-label="Track progress" aria-valuemax={durationMS} aria-valuemin={0} aria-valuenow={Math.round(progressMS)}>
					<span style={{ transform: `scaleX(${progressPercent / 100})` }} />
				</span>
			</div>
			<div className="SpotifyPlayer-controls" aria-label="Spotify playback controls" role="group">
				<button aria-label="Previous track" disabled={isActing || !player || playback?.device.isRestricted} onClick={() => void sendAction('previous')} title="Previous" type="button">
					<IconPlayerSkipBackFilled aria-hidden="true" size={13} />
				</button>
				<button
					aria-label={playback?.isPlaying ? 'Pause' : 'Play'}
					className="SpotifyPlayer-play"
					disabled={isActing || !player || playback?.device.isRestricted}
					onClick={() => void sendAction(playback?.isPlaying ? 'pause' : 'play')}
					title={playback?.isPlaying ? 'Pause' : 'Play'}
					type="button"
				>
					{playback?.isPlaying
						? <IconPlayerPauseFilled aria-hidden="true" size={13} />
						: <IconPlayerPlayFilled aria-hidden="true" size={13} />}
				</button>
				<button aria-label="Next track" disabled={isActing || !player || playback?.device.isRestricted} onClick={() => void sendAction('next')} title="Next" type="button">
					<IconPlayerSkipForwardFilled aria-hidden="true" size={13} />
				</button>
			</div>
		</div>
	)
}
