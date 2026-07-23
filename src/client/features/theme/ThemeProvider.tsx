import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { getLocalStorageItem, setLocalStorageItem } from '../../lib/browser/localStorage'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'agentboard.theme'

interface ThemeContextValue {
	theme: Theme
	setTheme: (theme: Theme) => void
	toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>(readInitialTheme)

	useLayoutEffect(() => {
		document.documentElement.dataset.theme = theme
		document.documentElement.style.colorScheme = theme
		setLocalStorageItem(THEME_STORAGE_KEY, theme)
	}, [theme])

	const value = useMemo<ThemeContextValue>(() => ({
		theme,
		setTheme,
		toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
	}), [theme])

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
	const value = useContext(ThemeContext)
	if (!value) throw new Error('useTheme must be used inside ThemeProvider')
	return value
}

function readInitialTheme(): Theme {
	const stored = getLocalStorageItem(THEME_STORAGE_KEY)
	if (stored === 'light' || stored === 'dark') return stored
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
