import type { CanvasCustomColor } from '@agentboard/shared'
import {
	DEFAULT_THEME,
	registerColorsFromThemes,
	type TLDefaultColor,
	type TLTheme,
	type TLThemes,
} from 'tldraw'

interface CanvasColorDefinition {
	darkSolid: string
	darkSurface: string
	lightSolid: string
	lightSurface: string
}

const colorDefinitions = {
	'agent-blue': {
		darkSolid: '#7AA7FF',
		darkSurface: '#1D2D50',
		lightSolid: '#356AE6',
		lightSurface: '#E8F0FF',
	},
	'agent-purple': {
		darkSolid: '#B99AFF',
		darkSurface: '#302451',
		lightSolid: '#7950D8',
		lightSurface: '#F0EAFF',
	},
	'agent-teal': {
		darkSolid: '#56D6C2',
		darkSurface: '#173F3B',
		lightSolid: '#158A7A',
		lightSurface: '#E2F7F3',
	},
	'agent-amber': {
		darkSolid: '#F2C15D',
		darkSurface: '#4A3617',
		lightSolid: '#B87508',
		lightSurface: '#FFF2D2',
	},
	'agent-coral': {
		darkSolid: '#FF8E7C',
		darkSurface: '#4C2824',
		lightSolid: '#D94B3D',
		lightSurface: '#FFE8E3',
	},
	'agent-pink': {
		darkSolid: '#F08BC1',
		darkSurface: '#4A2338',
		lightSolid: '#C43D83',
		lightSurface: '#FCE6F2',
	},
} satisfies Record<CanvasCustomColor, CanvasColorDefinition>

const lightColors = Object.fromEntries(
	Object.entries(colorDefinitions).map(([name, definition]) => [
		name,
		createColor(definition.lightSolid, definition.lightSurface),
	])
) as Record<keyof typeof colorDefinitions, TLDefaultColor>

const darkColors = Object.fromEntries(
	Object.entries(colorDefinitions).map(([name, definition]) => [
		name,
		createColor(definition.darkSolid, definition.darkSurface),
	])
) as Record<keyof typeof colorDefinitions, TLDefaultColor>

const canvasTheme: TLTheme = {
	...DEFAULT_THEME,
	colors: {
		light: { ...DEFAULT_THEME.colors.light, ...lightColors },
		dark: { ...DEFAULT_THEME.colors.dark, ...darkColors },
	},
}

/**
 * The theme is registered at module load time because synchronized records are validated before
 * the editor mounts. Every client receives the same named colors in light and dark modes.
 */
export const canvasThemes: TLThemes = { default: canvasTheme }

registerColorsFromThemes(canvasThemes)

function createColor(solid: string, surface: string): TLDefaultColor {
	return {
		solid,
		semi: surface,
		pattern: solid,
		fill: solid,
		linedFill: surface,
		frameHeadingStroke: solid,
		frameHeadingFill: surface,
		frameStroke: solid,
		frameFill: surface,
		frameText: solid,
		noteFill: surface,
		noteText: solid,
		highlightSrgb: solid,
		highlightP3: solid,
	}
}
