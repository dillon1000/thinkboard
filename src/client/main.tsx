import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import posthog from 'posthog-js'
import { PostHogProvider } from '@posthog/react'
import '@fontsource-variable/rubik'
import 'katex/dist/katex.min.css'
import 'streamdown/styles.css'
import { router } from './app/router'
import { ThemeProvider } from './features/theme/ThemeProvider'
import './styles/global.css'

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined

if (posthogToken) {
	posthog.init(posthogToken, {
		// Capture through the same-origin `/ingest` Worker proxy so ad blockers that target the
		// PostHog ingestion host by name cannot silently drop events. `ui_host` keeps in-app links
		// pointing at the PostHog UI.
		api_host: `${window.location.origin}/ingest`,
		ui_host: 'https://us.posthog.com',
		defaults: '2026-01-30',
	})
} else if (import.meta.env.DEV) {
	console.error('VITE_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_PROJECT_TOKEN is configured')
}

const rootElement = document.getElementById('root')

if (!rootElement) {
	throw new Error('Missing #root element')
}

ReactDOM.createRoot(rootElement).render(
	<React.StrictMode>
		<PostHogProvider client={posthog}>
			<ThemeProvider>
				<RouterProvider router={router} />
			</ThemeProvider>
		</PostHogProvider>
	</React.StrictMode>
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
	window.addEventListener('load', () => {
		void navigator.serviceWorker.register('/service-worker.js')
	})
}
