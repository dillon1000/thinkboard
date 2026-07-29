import {
	DEFAULT_AGENT_PROFILE,
	type AgentProfile,
} from '@agentboard/shared'
import { eq } from 'drizzle-orm'
import type { Database } from './client'
import { agentProfile } from './schema'

/**
 * Returns one user's prompt preferences. The shared defaults apply until the user
 * saves a profile, so reading settings does not create database state.
 */
export async function getAgentProfile(
	database: Database,
	userID: string
): Promise<AgentProfile> {
	const [row] = await database.select().from(agentProfile)
		.where(eq(agentProfile.userID, userID))
		.limit(1)
	if (!row) return DEFAULT_AGENT_PROFILE
	return {
		aboutUser: row.aboutUser,
		customInstructions: row.customInstructions,
		customPersonality: row.customPersonality,
		personality: row.personality,
		promptSources: {
			aboutUser: row.includeAboutUser,
			boardContext: row.includeBoardContext,
			connectedServices: row.includeConnectedServices,
			customInstructions: row.includeCustomInstructions,
			memories: row.includeMemories,
		},
	}
}

/**
 * Replaces the user's full prompt profile in one upsert. Callers validate the
 * complete input first, so omitted switches cannot silently keep stale values.
 */
export async function saveAgentProfile(
	database: Database,
	userID: string,
	profile: AgentProfile,
	now = new Date()
): Promise<AgentProfile> {
	const value = {
		aboutUser: profile.aboutUser,
		customInstructions: profile.customInstructions,
		customPersonality: profile.customPersonality,
		includeAboutUser: profile.promptSources.aboutUser,
		includeBoardContext: profile.promptSources.boardContext,
		includeConnectedServices: profile.promptSources.connectedServices,
		includeCustomInstructions: profile.promptSources.customInstructions,
		includeMemories: profile.promptSources.memories,
		personality: profile.personality,
		updatedAt: now,
		userID,
	}
	await database.insert(agentProfile).values(value).onConflictDoUpdate({
		target: agentProfile.userID,
		set: value,
	})
	return profile
}
