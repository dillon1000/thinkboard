import type { MistakePattern } from '@agentboard/shared'
import { apiRoutes } from '@agentboard/shared'
import {
	IconBrain,
	IconCards,
	IconCheck,
	IconMessageCircle,
	IconPlugConnected,
	IconStack2,
	IconUserCheck,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { ProgressBar } from '../../../components/ProgressBar'
import { apiRequest } from '../../../lib/api'
import { WorkspaceShell } from '../../auth/components/WorkspaceShell'
import '../styles/memory.css'

interface StudyMemoryResponse {
	patterns: MistakePattern[]
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
})

export function Component() {
	const [patterns, setPatterns] = useState<MistakePattern[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		void loadMemory()
	}, [])

	async function loadMemory() {
		setError(null)
		setIsLoading(true)
		try {
			const response = await apiRequest<StudyMemoryResponse>(apiRoutes.studyMemory)
			setPatterns(response.patterns)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load agent memory')
		} finally {
			setIsLoading(false)
		}
	}

	const observationCount = patterns.reduce((total, pattern) => total + pattern.count, 0)

	return (
		<WorkspaceShell activePage="memory" skipTargetID="memory-content" title="Memory">
			<div className="MemoryPage" id="memory-content">
				<header className="MemoryPage-heading">
					<p className="Eyebrow">Transparency</p>
					<h1>What your study partner remembers</h1>
					<p>
						Agentboard’s cross-board memory saves only the learning patterns you approve.
						Your study partner can use them across boards to adjust its help.
					</p>
				</header>

				<section aria-labelledby="memory-summary-heading" className="MemorySummary">
					<div className="MemorySummary-mark">
						<IconBrain aria-hidden="true" size={23} stroke={1.7} />
					</div>
					<div>
						<p>Cross-board memory</p>
						<h2 id="memory-summary-heading">
							{isLoading
								? 'Loading saved patterns'
								: error
									? 'Memory unavailable'
								: `${patterns.length} saved ${patterns.length === 1 ? 'pattern' : 'patterns'}`}
						</h2>
					</div>
					{!isLoading && !error ? (
						<span>
							<IconCheck aria-hidden="true" size={13} stroke={2} />
							{observationCount} approved {observationCount === 1 ? 'observation' : 'observations'}
						</span>
					) : null}
				</section>

				<section aria-labelledby="learning-patterns-heading" className="MemorySection">
					<div className="MemorySection-heading">
						<div>
							<h2 id="learning-patterns-heading">Learning patterns</h2>
							<p>These records are added to the study agent’s instructions. It should use them only when relevant.</p>
						</div>
					</div>

					{isLoading ? (
						<div className="MemoryLoading">
							<ProgressBar label="Loading agent memory" />
						</div>
					) : error ? (
						<div className="MemoryError" role="alert">
							<p>{error}</p>
							<button className="Button" onClick={() => void loadMemory()} type="button">Try again</button>
						</div>
					) : patterns.length ? (
						<ol className="MemoryPatternList">
							{patterns.map((pattern) => (
								<li key={pattern.patternKey}>
									<div className="MemoryPattern-index" aria-hidden="true" />
									<article>
										<div className="MemoryPattern-meta">
											<span>{pattern.concept}</span>
											<span>
												Seen {pattern.count} {pattern.count === 1 ? 'time' : 'times'}
											</span>
										</div>
										<h3>{pattern.title}</h3>
										<p>{pattern.description}</p>
										<time dateTime={pattern.lastSeenAt}>
											Last approved {formatDate(pattern.lastSeenAt)}
										</time>
									</article>
								</li>
							))}
						</ol>
					) : (
						<div className="MemoryEmpty">
							<IconUserCheck aria-hidden="true" size={21} stroke={1.7} />
							<div>
								<strong>Nothing is saved here yet</strong>
								<p>A pattern appears only after you approve it in a Study Partner chat.</p>
							</div>
						</div>
					)}
				</section>

				<section aria-labelledby="other-context-heading" className="MemorySection MemoryContext">
					<div className="MemorySection-heading">
						<div>
							<h2 id="other-context-heading">Context that stays in its place</h2>
							<p>This data is stored or loaded, but it is not part of your cross-board memory.</p>
						</div>
					</div>
					<div className="MemoryContext-list">
						<article>
							<IconStack2 aria-hidden="true" size={17} stroke={1.7} />
							<div>
								<h3>Boards and documents</h3>
								<p>Your study partner reads the current board when you ask it for help.</p>
							</div>
							<span>Board context</span>
						</article>
						<article>
							<IconMessageCircle aria-hidden="true" size={17} stroke={1.7} />
							<div>
								<h3>Chat history</h3>
								<p>Messages stay with their conversation and return when you continue it.</p>
							</div>
							<span>Conversation context</span>
						</article>
						<article>
							<IconCards aria-hidden="true" size={17} stroke={1.7} />
							<div>
								<h3>Flashcards and review progress</h3>
								<p>The review scheduler stores your cards and results, but the study agent does not receive them as memory.</p>
							</div>
							<span>Review data</span>
						</article>
						<article>
							<IconPlugConnected aria-hidden="true" size={17} stroke={1.7} />
							<div>
								<h3>Connected services</h3>
								<p>Current service context can be loaded for a request, but it is not saved in agent memory.</p>
							</div>
							<span>Request context</span>
						</article>
					</div>
				</section>
			</div>
		</WorkspaceShell>
	)
}

function formatDate(value: string) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? 'on an unknown date' : dateFormatter.format(date)
}
