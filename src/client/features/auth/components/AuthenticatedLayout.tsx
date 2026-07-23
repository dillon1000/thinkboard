import { appRoutes } from '@agentboard/shared'
import { IconSparkles } from '@tabler/icons-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { authClient } from '../../../lib/authClient'

export function AuthenticatedLayout() {
	const session = authClient.useSession()
	const location = useLocation()

	if (session.isPending) {
		return (
			<div className="AppLoading" role="status">
				<span className="AppLoading-mark"><IconSparkles aria-hidden="true" size={20} stroke={1.8} /></span>
				<span>Opening your workspace…</span>
			</div>
		)
	}

	if (!session.data) {
		return <Navigate replace state={{ from: location.pathname }} to={appRoutes.login} />
	}

	return <Outlet />
}
