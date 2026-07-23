import { appRoutes } from '@agentboard/shared'
import { redirect } from 'react-router'

export function rootRedirectLoader() {
	return redirect(appRoutes.home)
}
