import {
	apiRoutes,
	appRoutes,
	spaceInvitationPreviewSchema,
	type SpaceInvitationPreview,
} from '@agentboard/shared'
import { IconArrowRight, IconLink, IconUsers } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { apiRequest } from '../../../lib/api'
import '../components/invitationRoute.css'

export function Component() {
	const { token = '' } = useParams<{ token: string }>()
	const [invitation, setInvitation] = useState<SpaceInvitationPreview | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isAccepting, setIsAccepting] = useState(false)
	const navigate = useNavigate()

	useEffect(() => {
		void apiRequest(
			apiRoutes.invitation(token),
			undefined,
			z.object({ invitation: spaceInvitationPreviewSchema })
		)
			.then((response) => setInvitation(response.invitation))
			.catch((loadError) => {
				setError(loadError instanceof Error ? loadError.message : 'Unable to open invitation')
			})
	}, [token])

	async function acceptInvitation() {
		setIsAccepting(true)
		setError(null)
		try {
			const response = await apiRequest(apiRoutes.invitation(token), {
				method: 'POST',
			}, z.object({ boardID: z.string() }))
			navigate(appRoutes.board(response.boardID), { replace: true })
		} catch (acceptError) {
			setError(acceptError instanceof Error ? acceptError.message : 'Unable to accept invitation')
			setIsAccepting(false)
		}
	}

	return (
		<main className="InvitationPage">
			<section className="InvitationCard">
				<span><IconLink aria-hidden="true" size={22} /></span>
				<p className="Eyebrow">Space invitation</p>
				{invitation ? (
					<>
						<h1>{invitation.boardTitle}</h1>
						<p>
							You will join as {articleFor(invitation.role)} <strong>{invitation.role}</strong>.
							{invitation.email ? ` This link is restricted to ${invitation.email}.` : ''}
						</p>
						<button disabled={isAccepting} onClick={() => void acceptInvitation()} type="button">
							<IconUsers aria-hidden="true" size={17} />
							{isAccepting ? 'Joining…' : 'Join space'}
							<IconArrowRight aria-hidden="true" size={16} />
						</button>
						<small>Link expires {formatDate(invitation.expiresAt)}</small>
					</>
				) : null}
				{!invitation && !error ? <p role="status">Checking invitation…</p> : null}
				{error ? <p className="FormError" role="alert">{error}</p> : null}
				<Link to={appRoutes.home}>Back to spaces</Link>
			</section>
		</main>
	)
}

function articleFor(role: SpaceInvitationPreview['role']) {
	return role === 'editor' ? 'an' : 'a'
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(value))
}
