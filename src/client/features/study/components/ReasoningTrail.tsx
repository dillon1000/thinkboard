import { IconChevronRight } from '@tabler/icons-react'
import { useId, useState } from 'react'
import { ThinkingStatus } from '../../../components/ThinkingStatus'

interface ReasoningTrailProps {
	isStreaming: boolean
	text: string
}

/** Shows model reasoning only after the student opens the disclosure. */
export function ReasoningTrail({ isStreaming, text }: ReasoningTrailProps) {
	const [isExpanded, setIsExpanded] = useState(false)
	const bodyID = useId()
	const trail = text.trim()
	if (!trail) return null

	return (
		<div className="ReasoningTrail">
			<button
				aria-controls={bodyID}
				aria-expanded={isExpanded}
				className={`ReasoningTrail-toggle${isExpanded ? ' is-expanded' : ''}`}
				onClick={() => setIsExpanded((current) => !current)}
				type="button"
			>
				<IconChevronRight aria-hidden="true" size={13} stroke={2} />
				{isStreaming
					? <ThinkingStatus state="solving">Reasoning trace</ThinkingStatus>
					: <span>Reasoning trace</span>}
			</button>
			{isExpanded ? <div className="ReasoningTrail-body" id={bodyID}>{trail}</div> : null}
		</div>
	)
}
