/**
 * Shows the shared Thinkspace brand asset with an accessible name.
 */
export function ThinkspaceWordmark() {
	return <img alt="Thinkspace" className="Wordmark-image" src="/thinkspace.webp" />
}

/**
 * Shows the compact Thinkspace mark where the full wordmark does not fit.
 */
export function ThinkspaceIcon() {
	return <img alt="" aria-hidden="true" className="ThinkspaceIcon" src="/thinkspace-icon.webp" />
}
