import {
	DEFAULT_AGENT_PROFILE,
	type AgentMemory,
} from '@agentboard/shared'
import { describe, expect, it } from 'vitest'
import { buildAgentProfilePrompt } from './agentProfilePrompt'

const memory: AgentMemory = {
	content: 'Prefers one hint at a time.',
	count: 1,
	kind: 'preference',
	lastSavedAt: '2026-07-29T00:00:00.000Z',
	memoryKey: 'hint-pacing',
	title: 'Hint pacing',
	topic: 'Study style',
}

describe('buildAgentProfilePrompt', () => {
	it('places each enabled source in a distinct prompt section', () => {
		const prompt = buildAgentProfilePrompt({
			...DEFAULT_AGENT_PROFILE,
			aboutUser: 'I study chemistry.',
			customInstructions: 'Use short examples.',
			personality: 'precise',
		}, [memory])

		expect(prompt).toContain('<personality>')
		expect(prompt).toContain('Be compact and exact.')
		expect(prompt).toContain('<user-profile>')
		expect(prompt).toContain('<user-instructions>')
		expect(prompt).toContain('<user-memory>')
	})

	it('omits disabled prompt sources', () => {
		const prompt = buildAgentProfilePrompt({
			...DEFAULT_AGENT_PROFILE,
			aboutUser: 'I study chemistry.',
			customInstructions: 'Use short examples.',
			promptSources: {
				...DEFAULT_AGENT_PROFILE.promptSources,
				aboutUser: false,
				customInstructions: false,
				memories: false,
			},
		}, [memory])

		expect(prompt).not.toContain('<user-profile>')
		expect(prompt).not.toContain('<user-instructions>')
		expect(prompt).not.toContain('<user-memory>')
	})

	it('uses custom personality text inside the personality layer', () => {
		const prompt = buildAgentProfilePrompt({
			...DEFAULT_AGENT_PROFILE,
			customPersonality: 'Talk like a patient lab partner.',
			personality: 'custom',
		}, [])

		expect(prompt).toContain('"Talk like a patient lab partner."')
	})
})
