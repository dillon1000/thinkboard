import { createBrowserRouter } from 'react-router'
import { AuthenticatedLayout } from '../features/auth/components/AuthenticatedLayout'
import { rootRedirectLoader } from '../features/boards/routes/RootRedirect'
import { NotFoundRoute } from './routes/NotFoundRoute'
import { RouteErrorBoundary } from './routes/RouteErrorBoundary'

export const router = createBrowserRouter([
	{
		path: '/',
		loader: rootRedirectLoader,
		ErrorBoundary: RouteErrorBoundary,
	},
	{
		path: '/login',
		lazy: () => import('../features/auth/routes/LoginRoute'),
	},
	{
		Component: AuthenticatedLayout,
		ErrorBoundary: RouteErrorBoundary,
		children: [
			{
				path: '/boards',
				lazy: () => import('../features/boards/routes/BoardsRoute'),
			},
			{
				path: '/boards/:boardID',
				lazy: () => import('../features/boards/routes/BoardRoute'),
			},
			{
				path: '/settings',
				lazy: () => import('../features/settings/routes/SettingsRoute'),
			},
			{
				path: '/memory',
				lazy: () => import('../features/memory/routes/MemoryRoute'),
			},
			{
				path: '/today',
				lazy: () => import('../features/today/routes/TodayRoute'),
			},
		],
	},
	{
		path: '*',
		Component: NotFoundRoute,
	},
])
