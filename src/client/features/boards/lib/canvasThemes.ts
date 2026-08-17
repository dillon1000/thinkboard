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

const lightColors = {
	'agent-blue': createColor(colorDefinitions['agent-blue'].lightSolid, colorDefinitions['agent-blue'].lightSurface),
	'agent-purple': createColor(colorDefinitions['agent-purple'].lightSolid, colorDefinitions['agent-purple'].lightSurface),
	'agent-teal': createColor(colorDefinitions['agent-teal'].lightSolid, colorDefinitions['agent-teal'].lightSurface),
	'agent-amber': createColor(colorDefinitions['agent-amber'].lightSolid, colorDefinitions['agent-amber'].lightSurface),
	'agent-coral': createColor(colorDefinitions['agent-coral'].lightSolid, colorDefinitions['agent-coral'].lightSurface),
	'agent-pink': createColor(colorDefinitions['agent-pink'].lightSolid, colorDefinitions['agent-pink'].lightSurface),
} satisfies Record<keyof typeof colorDefinitions, TLDefaultColor>

const darkColors = {
	'agent-blue': createColor(colorDefinitions['agent-blue'].darkSolid, colorDefinitions['agent-blue'].darkSurface),
	'agent-purple': createColor(colorDefinitions['agent-purple'].darkSolid, colorDefinitions['agent-purple'].darkSurface),
	'agent-teal': createColor(colorDefinitions['agent-teal'].darkSolid, colorDefinitions['agent-teal'].darkSurface),
	'agent-amber': createColor(colorDefinitions['agent-amber'].darkSolid, colorDefinitions['agent-amber'].darkSurface),
	'agent-coral': createColor(colorDefinitions['agent-coral'].darkSolid, colorDefinitions['agent-coral'].darkSurface),
	'agent-pink': createColor(colorDefinitions['agent-pink'].darkSolid, colorDefinitions['agent-pink'].darkSurface),
} satisfies Record<keyof typeof colorDefinitions, TLDefaultColor>

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
