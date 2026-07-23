import { IconMoon, IconSun } from '@tabler/icons-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle({ className = '' }: { className?: string }) {
	const { theme, toggleTheme } = useTheme()
	const nextTheme = theme === 'dark' ? 'light' : 'dark'

	return (
		<button
			aria-label={`Use ${nextTheme} mode`}
			className={`ThemeToggle ${className}`.trim()}
			onClick={toggleTheme}
			title={`Use ${nextTheme} mode`}
			type="button"
		>
			{theme === 'dark'
				? <IconSun aria-hidden="true" size={16} stroke={1.8} />
				: <IconMoon aria-hidden="true" size={16} stroke={1.8} />}
		</button>
	)
}
