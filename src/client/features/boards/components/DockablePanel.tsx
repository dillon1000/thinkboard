import { IconChevronRight } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'

export type DockEdge = 'top' | 'right' | 'bottom' | 'left'

const STORAGE_PREFIX = 'agentboard.dock.'

interface DockablePanelProps {
	/** The screen edge this island tucks against — its nearest one. */
	edge: DockEdge
	/** Stable id used to remember the docked state across sessions. */
	id: string
	/** Human label for the show/hide control, e.g. "tools". */
	label: string
	/** Extra class on the wrapper — used to carry positioning for absolutely-placed islands. */
	className?: string
	children: ReactNode
}

/**
 * Wraps a canvas island so it can be tucked against its nearest edge. Docking slides the island
 * out of the way behind a chevron tab; hovering the tab peeks the island back a little so it can
 * be recognised before it's fully restored. The docked choice is remembered per board session.
 */
export function DockablePanel({ edge, id, label, className, children }: DockablePanelProps) {
	const [docked, setDocked] = useState(() => readDocked(id))
	const [peeking, setPeeking] = useState(false)

	function toggle() {
		setDocked((current) => {
			const next = !current
			writeDocked(id, next)
			if (next) setPeeking(false)
			return next
		})
	}

	return (
		<div className={className ? `Dockable ${className}` : 'Dockable'} data-docked={docked} data-edge={edge} data-peek={peeking && docked}>
			<div className="Dockable-body">{children}</div>
			<button
				aria-pressed={docked}
				className="Dockable-handle"
				aria-label={docked ? `Show ${label}` : `Hide ${label}`}
				onClick={toggle}
				onPointerEnter={() => setPeeking(true)}
				onPointerLeave={() => setPeeking(false)}
				title={docked ? `Show ${label}` : `Hide ${label}`}
				type="button"
			>
				<IconChevronRight aria-hidden="true" size={13} stroke={2.6} />
			</button>
		</div>
	)
}

function readDocked(id: string): boolean {
	try {
		return window.localStorage.getItem(`${STORAGE_PREFIX}${id}`) === 'docked'
	} catch {
		return false
	}
}

function writeDocked(id: string, docked: boolean) {
	try {
		if (docked) window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, 'docked')
		else window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
	} catch {
		// Docking still works for the session when storage is unavailable.
	}
}
