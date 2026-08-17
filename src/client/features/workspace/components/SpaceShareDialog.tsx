import {
	apiRoutes,
	appRoutes,
	boardRoleSchema,
	invitationRoleSchema,
	spaceInvitationCreatedSchema,
	spaceInvitationSchema,
	spaceMemberSchema,
	type BoardRole,
	type InvitationRole,
	type SpaceInvitation,
	type SpaceMember,
} from '@agentboard/shared'
import {
	IconCheck,
	IconCopy,
	IconLink,
	IconTrash,
	IconUsers,
	IconX,
} from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { apiRequest } from '../../../lib/api'
import './spaceShareDialog.css'

interface SpaceShareDialogProps {
	boardID: string
	onClose: () => void
}

export function SpaceShareDialog({ boardID, onClose }: SpaceShareDialogProps) {
	const [members, setMembers] = useState<SpaceMember[]>([])
	const [invitations, setInvitations] = useState<SpaceInvitation[]>([])
	const [role, setRole] = useState<BoardRole>('viewer')
	const [inviteRole, setInviteRole] = useState<InvitationRole>('editor')
	const [email, setEmail] = useState('')
	const [createdLink, setCreatedLink] = useState<string | null>(null)
	const [didCopy, setDidCopy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isCreating, setIsCreating] = useState(false)

	useEffect(() => {
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', closeOnEscape)
		void loadAccess()
		return () => window.removeEventListener('keydown', closeOnEscape)
	}, [boardID])

	async function loadAccess() {
		setIsLoading(true)
		try {
			const access = await apiRequest(
				apiRoutes.boardMembers(boardID),
				undefined,
				z.object({ members: z.array(spaceMemberSchema), role: boardRoleSchema })
			)
			setMembers(access.members)
			setRole(access.role)
			if (access.role === 'owner') {
				const response = await apiRequest(
					apiRoutes.boardInvitations(boardID),
					undefined,
					z.object({ invitations: z.array(spaceInvitationSchema) })
				)
				setInvitations(response.invitations)
			}
			setError(null)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load space access')
		} finally {
			setIsLoading(false)
		}
	}

	async function createInvitation(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setIsCreating(true)
		setError(null)
		try {
			const response = await apiRequest(
				apiRoutes.boardInvitations(boardID),
				{
					method: 'POST',
					body: JSON.stringify({ email: email.trim() || null, role: inviteRole }),
				},
				z.object({ invitation: spaceInvitationCreatedSchema })
			)
			const link = `${window.location.origin}${appRoutes.invitation(response.invitation.token)}`
			setInvitations((current) => [response.invitation, ...current])
			setCreatedLink(link)
			setEmail('')
			await copyLink(link)
		} catch (createError) {
			setError(createError instanceof Error ? createError.message : 'Unable to create invitation')
		} finally {
			setIsCreating(false)
		}
	}

	async function copyLink(link = createdLink) {
		if (!link) return
		try {
			await navigator.clipboard.writeText(link)
			setDidCopy(true)
			window.setTimeout(() => setDidCopy(false), 2_000)
		} catch {
			setDidCopy(false)
		}
	}

	async function changeRole(userID: string, nextRole: InvitationRole) {
		setError(null)
		try {
			await apiRequest(apiRoutes.boardMember(boardID, userID), {
				method: 'PATCH',
				body: JSON.stringify({ role: nextRole }),
			})
			setMembers((current) => current.map((member) =>
				member.userID === userID ? { ...member, role: nextRole } : member
			))
		} catch (updateError) {
			setError(updateError instanceof Error ? updateError.message : 'Unable to update member')
		}
	}

	async function removeMember(member: SpaceMember) {
		if (!window.confirm(`Remove ${member.name} from this space?`)) return
		setError(null)
		try {
			await apiRequest(apiRoutes.boardMember(boardID, member.userID), { method: 'DELETE' })
			setMembers((current) => current.filter(({ userID }) => userID !== member.userID))
		} catch (removeError) {
			setError(removeError instanceof Error ? removeError.message : 'Unable to remove member')
		}
	}

	async function revokeInvitation(invitationID: string) {
		setError(null)
		try {
			await apiRequest(apiRoutes.boardInvitation(boardID, invitationID), { method: 'DELETE' })
			setInvitations((current) => current.filter(({ id }) => id !== invitationID))
		} catch (removeError) {
			setError(removeError instanceof Error ? removeError.message : 'Unable to revoke invitation')
		}
	}

	return (
		<div
			aria-labelledby="space-share-heading"
			aria-modal="true"
			className="SpaceShare-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
			role="dialog"
		>
			<section className="SpaceShare">
				<header>
					<span><IconUsers aria-hidden="true" size={18} /></span>
					<div>
						<h2 id="space-share-heading">Share this space</h2>
						<p>Members see live presence and receive access based on their role.</p>
					</div>
					<button aria-label="Close sharing" onClick={onClose} type="button">
						<IconX aria-hidden="true" size={18} />
					</button>
				</header>

				{error ? <p className="SpaceShare-error" role="alert">{error}</p> : null}
				{isLoading ? <p className="SpaceShare-loading" role="status">Loading access…</p> : null}

				{!isLoading && role === 'owner' ? (
					<form className="SpaceShare-invite" onSubmit={(event) => void createInvitation(event)}>
						<div>
							<label>
								<span>Email restriction <small>optional</small></span>
								<input
									autoComplete="email"
									onChange={(event) => setEmail(event.target.value)}
									placeholder="student@example.edu"
									type="email"
									value={email}
								/>
							</label>
							<label>
								<span>Role</span>
								<select
									onChange={(event) => setInviteRole(invitationRoleSchema.parse(event.target.value))}
									value={inviteRole}
								>
									<option value="editor">Editor</option>
									<option value="viewer">Viewer</option>
								</select>
							</label>
						</div>
						<button disabled={isCreating} type="submit">
							<IconLink aria-hidden="true" size={15} />
							{isCreating ? 'Creating…' : 'Create invite link'}
						</button>
					</form>
				) : null}

				{createdLink ? (
					<div className="SpaceShare-created">
						<input aria-label="Invitation link" readOnly value={createdLink} />
						<button onClick={() => void copyLink()} type="button">
							{didCopy
								? <IconCheck aria-hidden="true" size={15} />
								: <IconCopy aria-hidden="true" size={15} />}
							{didCopy ? 'Copied' : 'Copy'}
						</button>
					</div>
				) : null}

				<div className="SpaceShare-body">
					<section aria-labelledby="space-members-heading">
						<h3 id="space-members-heading">People</h3>
						<div className="SpaceShare-list">
							{members.map((member) => (
								<article key={member.userID}>
									<span aria-hidden="true">{initials(member.name)}</span>
									<div><strong>{member.name}</strong><small>{member.email}</small></div>
									{role === 'owner' && member.role !== 'owner' ? (
										<>
											<select
												aria-label={`Role for ${member.name}`}
												onChange={(event) => void changeRole(
													member.userID,
												invitationRoleSchema.parse(event.target.value)
												)}
												value={member.role}
											>
												<option value="editor">Editor</option>
												<option value="viewer">Viewer</option>
											</select>
											<button
												aria-label={`Remove ${member.name}`}
												onClick={() => void removeMember(member)}
												title="Remove member"
												type="button"
											>
												<IconTrash aria-hidden="true" size={15} />
											</button>
										</>
									) : <em>{member.role}</em>}
								</article>
							))}
						</div>
					</section>

					{role === 'owner' && invitations.length ? (
						<section aria-labelledby="space-invitations-heading">
							<h3 id="space-invitations-heading">Pending links</h3>
							<div className="SpaceShare-list">
								{invitations.map((invitation) => (
									<article key={invitation.id}>
										<span aria-hidden="true"><IconLink size={15} /></span>
										<div>
											<strong>{invitation.email ?? 'Anyone with the link'}</strong>
											<small>{invitation.role} · expires {formatDate(invitation.expiresAt)}</small>
										</div>
										<button
											aria-label="Revoke invitation"
											onClick={() => void revokeInvitation(invitation.id)}
											title="Revoke invitation"
											type="button"
										>
											<IconTrash aria-hidden="true" size={15} />
										</button>
									</article>
								))}
							</div>
						</section>
					) : null}
				</div>
			</section>
		</div>
	)
}

function initials(name: string) {
	return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}
