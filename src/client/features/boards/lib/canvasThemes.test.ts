import { DefaultColorStyle } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { canvasThemes } from './canvasThemes'

describe('canvasThemes', () => {
	it('registers the Agentboard palette for light and dark synchronized shapes', () => {
		expect(DefaultColorStyle.validate('agent-blue')).toBe('agent-blue')
		expect(canvasThemes.default.colors.light['agent-purple'].solid).toBeTruthy()
		expect(canvasThemes.default.colors.dark['agent-purple'].solid).toBeTruthy()
	})
})
