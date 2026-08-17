import { isRouteErrorResponse, useRouteError } from 'react-router'

export function RouteErrorBoundary() {
	const error = useRouteError()
	const message = getErrorMessage(error)

	return (
		<main className="RouteMessage">
			<h1>Something went wrong</h1>
			<p>{message}</p>
			<a href="/">Reload Thinkspace</a>
		</main>
	)
}

function getErrorMessage<ErrorValue>(error: ErrorValue): string {
	if (isRouteErrorResponse(error)) {
		return `${error.status} ${error.statusText}`.trim()
	}

	if (error instanceof Error) {
		return error.message
	}

	return 'An unexpected error interrupted this space.'
}
