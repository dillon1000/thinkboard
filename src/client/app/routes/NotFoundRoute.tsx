import { Link } from 'react-router'

export function NotFoundRoute() {
	return (
		<main className="RouteMessage">
			<h1>Space not found</h1>
			<p>The link may be incomplete or the space may no longer exist.</p>
			<Link to="/">Open your space</Link>
		</main>
	)
}
