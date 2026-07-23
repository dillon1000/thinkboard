import { Link } from 'react-router'

export function NotFoundRoute() {
	return (
		<main className="RouteMessage">
			<h1>Board not found</h1>
			<p>The link may be incomplete or the board may no longer exist.</p>
			<Link to="/">Open your board</Link>
		</main>
	)
}
