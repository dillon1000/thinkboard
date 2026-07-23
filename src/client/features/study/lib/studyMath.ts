import { createMathPlugin } from '@streamdown/math'

export const studyMarkdownPlugins = {
	math: createMathPlugin({
		errorColor: 'var(--danger)',
		singleDollarTextMath: true,
	}),
} as const
