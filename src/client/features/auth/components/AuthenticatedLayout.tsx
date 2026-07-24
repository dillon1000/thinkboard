import { appRoutes } from '@agentboard/shared'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ProgressBar } from '../../../components/ProgressBar'
import { authClient } from '../../../lib/authClient'

export function AuthenticatedLayout() {
	const session = authClient.useSession()
	const location = useLocation()

	if (session.isPending) {
		return (
			<div className="AppLoading">
				<ProgressBar label="Opening your workspace" />
			</div>
		)
	}

	if (!session.data) {
		return <Navigate replace state={{ from: location.pathname }} to={appRoutes.login} />
	}

	return <Outlet />
}
