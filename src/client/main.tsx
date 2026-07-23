import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import '@fontsource-variable/rubik'
import 'katex/dist/katex.min.css'
import 'streamdown/styles.css'
import { router } from './app/router'
import { ThemeProvider } from './features/theme/ThemeProvider'
import './styles/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
	throw new Error('Missing #root element')
}

ReactDOM.createRoot(rootElement).render(
	<React.StrictMode>
		<ThemeProvider>
			<RouterProvider router={router} />
		</ThemeProvider>
	</React.StrictMode>
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
	window.addEventListener('load', () => {
		void navigator.serviceWorker.register('/service-worker.js')
	})
}
