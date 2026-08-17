export type RadialBindAction =
	| 'ask-selection'
	| 'blue-pen'
	| 'delete-selection'
	| 'next-track'
	| 'none'
	| 'red-highlighter'

export const RADIAL_BIND_ACTIONS: RadialBindAction[] = [
	'none',
	'blue-pen',
	'red-highlighter',
	'next-track',
	'ask-selection',
	'delete-selection',
]

const radialBindActionSchema = z.enum(RADIAL_BIND_ACTIONS)
const radialMenuBindingsSchema = z.tuple([
	radialBindActionSchema,
	radialBindActionSchema,
	radialBindActionSchema,
])

const STORAGE_KEY = 'agentboard.radial-menu-bindings'
const DEFAULT_BINDINGS: RadialBindAction[] = ['blue-pen', 'next-track', 'ask-selection']

/** Reads the three user-defined radial shortcuts and rejects stale or malformed stored values. */
export function readRadialMenuBindings(): RadialBindAction[] {
	if (!globalThis.window) return [...DEFAULT_BINDINGS]
	try {
		const value = radialMenuBindingsSchema.safeParse(
			JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
		)
		if (value.success) return [...value.data]
	} catch {
		// A bad browser value must not prevent the menu from opening.
	}
	return [...DEFAULT_BINDINGS]
}

/** Replaces all three shortcut bindings so the stored state cannot become partially updated. */
export function writeRadialMenuBindings(bindings: RadialBindAction[]) {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings.slice(0, 3)))
}
import { z } from 'zod'
