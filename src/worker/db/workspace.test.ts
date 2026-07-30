import { describe, expect, it } from 'vitest'
import { hashInvitationToken, normalizeInvitationEmail } from './workspace'

describe('workspace invitations', () => {
	it('normalizes an optional recipient email', () => {
		expect(normalizeInvitationEmail(' Student@Example.edu ')).toBe('student@example.edu')
		expect(normalizeInvitationEmail('')).toBeNull()
		expect(normalizeInvitationEmail(null)).toBeNull()
	})

	it('hashes tokens deterministically without returning the token', async () => {
		const hash = await hashInvitationToken('invite-token')
		expect(hash).toBe(await hashInvitationToken('invite-token'))
		expect(hash).not.toContain('invite-token')
		expect(hash).toHaveLength(64)
	})
})
