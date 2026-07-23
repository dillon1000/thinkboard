import { motion } from 'motion/react'
import React, { useMemo, type JSX } from 'react'
import { cn } from '../lib/utils'

export type TextShimmerProps = {
	children: string
	as?: React.ElementType
	className?: string
	duration?: number
	spread?: number
}

function TextShimmerComponent({
	children,
	as: Component = 'p',
	className,
	duration = 2,
	spread = 2,
}: TextShimmerProps) {
	const MotionComponent = motion.create(Component as keyof JSX.IntrinsicElements)
	const dynamicSpread = useMemo(() => children.length * spread, [children, spread])

	return (
		<MotionComponent
			animate={{ backgroundPosition: '0% center' }}
			className={cn('TextShimmer', className)}
			initial={{ backgroundPosition: '100% center' }}
			style={{ '--shimmer-spread': `${dynamicSpread}px` } as React.CSSProperties}
			transition={{ repeat: Infinity, duration, ease: 'linear' }}
		>
			{children}
		</MotionComponent>
	)
}

export const TextShimmer = React.memo(TextShimmerComponent)
