import { motion } from 'motion/react'
import React, { useMemo } from 'react'
import { cn } from '../lib/utils'
import { cssVariables } from '../lib/styleTypes'

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
	const MotionComponent = motion.create(Component)
	const dynamicSpread = useMemo(() => children.length * spread, [children, spread])

	return (
		<MotionComponent
			animate={{ backgroundPosition: '0% center' }}
			className={cn('TextShimmer', className)}
			initial={{ backgroundPosition: '100% center' }}
			style={cssVariables({ '--shimmer-spread': `${dynamicSpread}px` })}
			transition={{ repeat: Infinity, duration, ease: 'linear' }}
		>
			{children}
		</MotionComponent>
	)
}

export const TextShimmer = React.memo(TextShimmerComponent)
