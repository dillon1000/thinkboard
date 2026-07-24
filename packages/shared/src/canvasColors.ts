import {
	DefaultColorStyle,
	EnumStyleProp,
	defaultShapeSchemas,
	type TLDefaultColor as TldrawDefaultColor,
} from '@tldraw/tlschema'

declare module '@tldraw/tlschema' {
	interface TLThemeDefaultColors {
		'agent-blue': TldrawDefaultColor
		'agent-purple': TldrawDefaultColor
		'agent-teal': TldrawDefaultColor
		'agent-amber': TldrawDefaultColor
		'agent-coral': TldrawDefaultColor
		'agent-pink': TldrawDefaultColor
	}
}

/**
 * These names are the custom colors that can be stored in synchronized tldraw records.
 * Add a name here and a matching theme definition in canvasThemes before plans can use it.
 */
export const CANVAS_CUSTOM_COLOR_NAMES = [
	'agent-blue',
	'agent-purple',
	'agent-teal',
	'agent-amber',
	'agent-coral',
	'agent-pink',
] as const

export type CanvasCustomColor = (typeof CANVAS_CUSTOM_COLOR_NAMES)[number]

/**
 * Register the shared palette before a tldraw schema is created.
 * Both the browser and the sync server must accept the same persisted style values.
 */
export function registerCanvasCustomColors(): void {
	const labelColorStyle = defaultShapeSchemas.geo.props?.labelColor
	if (!(labelColorStyle instanceof EnumStyleProp)) {
		throw new Error('The tldraw geo schema does not expose its label color style')
	}
	DefaultColorStyle.addValues(...CANVAS_CUSTOM_COLOR_NAMES)
	labelColorStyle.addValues(...CANVAS_CUSTOM_COLOR_NAMES)
}
