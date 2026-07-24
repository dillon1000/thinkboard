import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

interface ThinkingStatusProps {
	children: ReactNode
	className?: string
	state?: OrbState
}

export function ThinkingStatus({
	children,
	className,
	state = 'working',
}: ThinkingStatusProps) {
	return (
		<span aria-live="polite" className={cn('ThinkingStatus', className)} role="status">
			<ThinkingOrb aria-hidden="true" size={20} state={state} />
			<span>{children}</span>
		</span>
	)
}
