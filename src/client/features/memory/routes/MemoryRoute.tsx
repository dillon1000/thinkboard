import type { AgentMemory, AgentMemoryKind } from '@agentboard/shared'
import { apiRoutes } from '@agentboard/shared'
import { IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { ProgressBar } from '../../../components/ProgressBar'
import { apiRequest } from '../../../lib/api'
import { WorkspaceShell } from '../../auth/components/WorkspaceShell'
import '../styles/memory.css'

interface StudyMemoryResponse {
	memories: AgentMemory[]
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
})

const memoryKindLabels: Record<AgentMemoryKind, string> = {
	background: 'Background',
	goal: 'Goal',
	'learning-pattern': 'Learning pattern',
	preference: 'Preference',
}

export function Component() {
	const [memories, setMemories] = useState<AgentMemory[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null)
	const [removingKey, setRemovingKey] = useState<string | null>(null)

	useEffect(() => {
		void loadMemory()
	}, [])

	async function loadMemory() {
		setError(null)
		setIsLoading(true)
		try {
			const response = await apiRequest<StudyMemoryResponse>(apiRoutes.studyMemory)
			setMemories(response.memories)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load memory')
		} finally {
			setIsLoading(false)
		}
	}

	async function removeMemory(memory: AgentMemory) {
		setError(null)
		setRemovingKey(memory.memoryKey)
		try {
			await apiRequest(apiRoutes.studyMemoryItem(memory.memoryKey), { method: 'DELETE' })
			setMemories((current) =>
				current.filter(({ memoryKey }) => memoryKey !== memory.memoryKey)
			)
			setPendingRemoveKey(null)
		} catch (removeError) {
			setError(removeError instanceof Error ? removeError.message : 'Unable to remove memory')
		} finally {
			setRemovingKey(null)
		}
	}

	return (
		<WorkspaceShell activePage="memory" skipTargetID="memory-content" title="Memory">
			<div className="MemoryPage" id="memory-content">
				<header className="MemoryHeading">
					<div>
						<h1>Memory</h1>
						<p>Facts your study partner can carry from one board to another.</p>
					</div>
					{!isLoading && !error ? (
						<span>{memories.length} saved</span>
					) : null}
				</header>

				<div className="MemoryLayout">
					<aside className="MemoryGuide">
						<h2>How it works</h2>
						<p>Your study partner can propose a memory in chat. Nothing is saved until you accept it.</p>
						<p>Removing a memory deletes every saved copy with the same key.</p>
					</aside>

					<section aria-labelledby="saved-memories-heading" className="MemoryRecords">
						<h2 id="saved-memories-heading">Saved memories</h2>

						{error ? (
							<div className="MemoryError" role="alert">
								<span>{error}</span>
								<button onClick={() => void loadMemory()} type="button">Try again</button>
							</div>
						) : null}

						{isLoading ? (
							<div className="MemoryLoading">
								<ProgressBar label="Loading memory" />
							</div>
						) : memories.length ? (
							<ul className="MemoryList">
								{memories.map((memory) => {
									const isConfirming = pendingRemoveKey === memory.memoryKey
									const isRemoving = removingKey === memory.memoryKey
									return (
										<li key={memory.memoryKey}>
											<div className="MemoryRecord">
												<div className="MemoryRecord-meta">
													<span>{memoryKindLabels[memory.kind]}</span>
													<span>{memory.topic}</span>
													<time dateTime={memory.lastSavedAt}>{formatDate(memory.lastSavedAt)}</time>
												</div>
												<h3>{memory.title}</h3>
												<p>{memory.content}</p>
												{memory.count > 1 ? <small>Approved {memory.count} times</small> : null}
											</div>

											{isConfirming ? (
												<div aria-label={`Remove ${memory.title}`} className="MemoryRemoveConfirm" role="group">
													<span>Remove this memory?</span>
													<button
														className="MemoryRemove-danger"
														disabled={isRemoving}
														onClick={() => void removeMemory(memory)}
														type="button"
													>
														{isRemoving ? 'Removing…' : 'Remove'}
													</button>
													<button
														disabled={isRemoving}
														onClick={() => setPendingRemoveKey(null)}
														type="button"
													>
														Keep
													</button>
												</div>
											) : (
												<button
													aria-label={`Remove ${memory.title}`}
													className="MemoryRemove"
													onClick={() => setPendingRemoveKey(memory.memoryKey)}
													type="button"
												>
													<IconTrash aria-hidden="true" size={14} stroke={1.8} />
													Remove
												</button>
											)}
										</li>
									)
								})}
							</ul>
						) : (
							<div className="MemoryEmpty">
								<h3>No saved memories</h3>
								<p>Ask your study partner to remember something. You will approve the exact text before it is saved.</p>
							</div>
						)}

						<p className="MemoryBoundary">
							Boards, chat history, flashcards, and connected-service context stay in their own features. They are not agent memory.
						</p>
					</section>
				</div>
			</div>
		</WorkspaceShell>
	)
}

function formatDate(value: string) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? 'Unknown date' : dateFormatter.format(date)
}
