import { appRoutes } from '@agentboard/shared'
import { usePostHog } from '@posthog/react'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ProgressBar } from '../../../components/ProgressBar'
import { authClient } from '../../../lib/authClient'

export function AuthenticatedLayout() {
	const session = authClient.useSession()
	const location = useLocation()
	const posthog = usePostHog()

	useEffect(() => {
		if (!session.data?.user) return
		const { id, name, email } = session.data.user
		posthog?.identify(id, { name, email })
	}, [posthog, session.data?.user?.id])

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
