import type { CSSProperties } from 'react'

/** Allows React style objects to carry application-owned CSS custom properties. */
export type CSSVariableStyle = CSSProperties & {
	[key: `--${string}`]: number | string | undefined
}

/** Preserves custom property keys while returning a React-compatible style owner. */
export function cssVariables(style: CSSVariableStyle): CSSVariableStyle {
	return style
}
