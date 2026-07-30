import {
	DEFAULT_AGENT_PROFILE,
	agentProfileSchema,
	apiRoutes,
	type AgentMemory,
	type AgentMemoryKind,
	type AgentPersonality,
	type AgentProfile,
	type AgentPromptSources,
	type ManualAgentMemory,
} from '@agentboard/shared'
import { IconCheck, IconPlus, IconTrash } from '@tabler/icons-react'
import { type FormEvent, useEffect, useState } from 'react'
import { ProgressBar } from '../../../components/ProgressBar'
import { apiRequest } from '../../../lib/api'
import { WorkspaceShell } from '../../auth/components/WorkspaceShell'
import '../styles/memory.css'

interface StudyMemoryResponse {
	memories: AgentMemory[]
}

interface AgentProfileResponse {
	profile: AgentProfile
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

const personalities: Array<{
	description: string
	id: AgentPersonality
	name: string
}> = [
	{
		description: 'Calm, concise, curious, and rigorous.',
		id: 'balanced',
		name: 'Balanced',
	},
	{
		description: 'Warm and patient, with specific encouragement.',
		id: 'encouraging',
		name: 'Encouraging',
	},
	{
		description: 'Compact and exact, with the answer or correction first.',
		id: 'precise',
		name: 'Precise',
	},
	{
		description: 'Candid and demanding; tests assumptions and reasoning.',
		id: 'challenging',
		name: 'Challenging',
	},
	{
		description: 'Write the tone and manner you want.',
		id: 'custom',
		name: 'Make your own',
	},
]

const promptSourceCopy: Record<keyof AgentPromptSources, {
	description: string
	label: string
	promptLocation: string
}> = {
	aboutUser: {
		description: 'The background you write below.',
		label: 'About you',
		promptLocation: '<user-profile>',
	},
	boardContext: {
		description: 'Visible shapes, selected work, and linked space documents.',
		label: 'Current space',
		promptLocation: '<canvas-context>',
	},
	connectedServices: {
		description: 'Passive context from connected services, such as Spotify and Craft.',
		label: 'Connected services',
		promptLocation: 'service context',
	},
	customInstructions: {
		description: 'Your response and working preferences.',
		label: 'Custom instructions',
		promptLocation: '<user-instructions>',
	},
	memories: {
		description: 'The individual facts in your saved memory list.',
		label: 'Saved memories',
		promptLocation: '<user-memory>',
	},
}

const emptyMemory: ManualAgentMemory = {
	content: '',
	kind: 'background',
	title: '',
	topic: '',
}

export function Component() {
	const [memories, setMemories] = useState<AgentMemory[]>([])
	const [profile, setProfile] = useState<AgentProfile>(DEFAULT_AGENT_PROFILE)
	const [savedProfile, setSavedProfile] = useState<AgentProfile>(DEFAULT_AGENT_PROFILE)
	const [newMemory, setNewMemory] = useState<ManualAgentMemory>(emptyMemory)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [memoryError, setMemoryError] = useState<string | null>(null)
	const [profileError, setProfileError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isAddingMemory, setIsAddingMemory] = useState(false)
	const [isMemoryFormOpen, setIsMemoryFormOpen] = useState(false)
	const [isSavingProfile, setIsSavingProfile] = useState(false)
	const [profileSaved, setProfileSaved] = useState(false)
	const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null)
	const [removingKey, setRemovingKey] = useState<string | null>(null)

	useEffect(() => {
		void loadPage()
	}, [])

	async function loadPage() {
		setLoadError(null)
		setIsLoading(true)
		try {
			const [memoryResponse, profileResponse] = await Promise.all([
				apiRequest<StudyMemoryResponse>(apiRoutes.studyMemory),
				apiRequest<AgentProfileResponse>(apiRoutes.studyAgentProfile),
			])
			setMemories(memoryResponse.memories)
			setProfile(profileResponse.profile)
			setSavedProfile(profileResponse.profile)
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Unable to load agent settings')
		} finally {
			setIsLoading(false)
		}
	}

	async function loadMemories() {
		const response = await apiRequest<StudyMemoryResponse>(apiRoutes.studyMemory)
		setMemories(response.memories)
	}

	async function addMemory(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setMemoryError(null)
		setIsAddingMemory(true)
		try {
			await apiRequest(apiRoutes.studyMemory, {
				body: JSON.stringify(newMemory),
				method: 'POST',
			})
			await loadMemories()
			setNewMemory(emptyMemory)
			setIsMemoryFormOpen(false)
		} catch (error) {
			setMemoryError(error instanceof Error ? error.message : 'Unable to add memory')
		} finally {
			setIsAddingMemory(false)
		}
	}

	async function saveProfile(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setProfileError(null)
		setProfileSaved(false)
		const parsed = agentProfileSchema.safeParse(profile)
		if (!parsed.success) {
			setProfileError('Check the profile fields and try again.')
			return
		}
		setIsSavingProfile(true)
		try {
			const response = await apiRequest<AgentProfileResponse>(apiRoutes.studyAgentProfile, {
				body: JSON.stringify(parsed.data),
				method: 'PUT',
			})
			setProfile(response.profile)
			setSavedProfile(response.profile)
			setProfileSaved(true)
		} catch (error) {
			setProfileError(error instanceof Error ? error.message : 'Unable to save agent settings')
		} finally {
			setIsSavingProfile(false)
		}
	}

	async function removeMemory(memory: AgentMemory) {
		setMemoryError(null)
		setRemovingKey(memory.memoryKey)
		try {
			await apiRequest(apiRoutes.studyMemoryItem(memory.memoryKey), { method: 'DELETE' })
			setMemories((current) =>
				current.filter(({ memoryKey }) => memoryKey !== memory.memoryKey)
			)
			setPendingRemoveKey(null)
		} catch (error) {
			setMemoryError(error instanceof Error ? error.message : 'Unable to remove memory')
		} finally {
			setRemovingKey(null)
		}
	}

	function updatePromptSource(source: keyof AgentPromptSources, checked: boolean) {
		setProfile((current) => ({
			...current,
			promptSources: { ...current.promptSources, [source]: checked },
		}))
		setProfileSaved(false)
	}

	const hasProfileChanges = JSON.stringify(profile) !== JSON.stringify(savedProfile)

	return (
		<WorkspaceShell activePage="memory" skipTargetID="memory-content" title="Agent">
			<div className="MemoryPage" id="memory-content">
				<header className="MemoryHeading">
					<div>
						<p className="MemoryEyebrow">Agent controls</p>
						<h1>What your agent knows</h1>
						<p>Set its voice, give it context, and choose what reaches each prompt.</p>
					</div>
					{!isLoading && !loadError ? <span>{memories.length} memories</span> : null}
				</header>

				{loadError ? (
					<div className="MemoryError MemoryError--page" role="alert">
						<span>{loadError}</span>
						<button onClick={() => void loadPage()} type="button">Try again</button>
					</div>
				) : isLoading ? (
					<div className="MemoryLoading">
						<ProgressBar label="Loading agent settings" />
					</div>
				) : (
					<div className="AgentControlLayout">
						<aside className="AgentControlIndex">
							<div className="AgentControlIndex-heading">
								<span aria-hidden="true" />
								<div>
									<p>Context stack</p>
									<small>Built for every turn</small>
								</div>
							</div>
							<nav aria-label="Agent control sections">
								<a href="#agent-voice"><span>Voice</span><code>personality</code></a>
								<a href="#agent-about"><span>About you</span><code>user-profile</code></a>
								<a href="#agent-instructions"><span>Instructions</span><code>user-instructions</code></a>
								<a href="#agent-sources"><span>Sources</span><code>context</code></a>
								<a href="#agent-memory"><span>Memories</span><code>user-memory</code></a>
							</nav>
							<p className="AgentControlIndex-note">Changes apply to the next agent response.</p>
						</aside>

						<main className="AgentControlMain">
							<form className="AgentProfileForm" onSubmit={(event) => void saveProfile(event)}>
								<PromptSection
									description="This block changes how the agent sounds. Study mode still controls whether it teaches directly or with questions."
									id="agent-voice"
									promptLocation="<personality>"
									title="Agent voice"
								>
									<fieldset aria-label="Agent personality" className="PersonalityList">
										{personalities.map((personality) => (
											<label data-selected={profile.personality === personality.id} key={personality.id}>
												<input
													checked={profile.personality === personality.id}
													name="personality"
													onChange={() => {
														setProfile((current) => ({ ...current, personality: personality.id }))
														setProfileSaved(false)
													}}
													type="radio"
												/>
												<span>
													<strong>{personality.name}</strong>
													<small>{personality.description}</small>
												</span>
												<span aria-hidden="true" className="PersonalityMark">
													{profile.personality === personality.id ? <IconCheck size={13} stroke={2.2} /> : null}
												</span>
											</label>
										))}
									</fieldset>

									{profile.personality === 'custom' ? (
										<label className="AgentTextField">
											<span>Custom personality</span>
											<textarea
												maxLength={1_000}
												onChange={(event) => {
													setProfile((current) => ({ ...current, customPersonality: event.target.value }))
													setProfileSaved(false)
												}}
												placeholder="For example: Talk like a patient lab partner who uses dry humor and never overexplains."
												rows={4}
												value={profile.customPersonality}
											/>
											<small>{profile.customPersonality.length}/1,000</small>
										</label>
									) : null}
								</PromptSection>

								<PromptSection
									description="Add stable background that helps the agent understand your situation. Keep temporary facts in individual memories."
									id="agent-about"
									promptLocation="<user-profile>"
									title="Tell the agent about you"
								>
									<label className="AgentTextField">
										<span>Background</span>
										<textarea
											maxLength={2_000}
											onChange={(event) => {
												setProfile((current) => ({ ...current, aboutUser: event.target.value }))
												setProfileSaved(false)
											}}
											placeholder="What are you studying? What level are you at? What are you working toward?"
											rows={6}
											value={profile.aboutUser}
										/>
										<small>{profile.aboutUser.length}/2,000</small>
									</label>
								</PromptSection>

								<PromptSection
									description="Set durable rules for responses and collaboration. Safety and tool approval rules still take priority."
									id="agent-instructions"
									promptLocation="<user-instructions>"
									title="Custom instructions"
								>
									<label className="AgentTextField">
										<span>How should the agent work with you?</span>
										<textarea
											maxLength={4_000}
											onChange={(event) => {
												setProfile((current) => ({ ...current, customInstructions: event.target.value }))
												setProfileSaved(false)
											}}
											placeholder="For example: Use concrete examples before formulas. Correct me directly. End explanations with one check question."
											rows={7}
											value={profile.customInstructions}
										/>
										<small>{profile.customInstructions.length}/4,000</small>
									</label>
								</PromptSection>

								<PromptSection
									description="Choose the passive context attached to each new agent turn. Turning a source off does not delete its data."
									id="agent-sources"
									promptLocation="prompt assembly"
									title="Prompt sources"
								>
									<div className="PromptSourceList">
										{(Object.keys(promptSourceCopy) as Array<keyof AgentPromptSources>).map((source) => {
											const copy = promptSourceCopy[source]
											return (
												<label key={source}>
													<span>
														<strong>{copy.label}</strong>
														<small>{copy.description}</small>
													</span>
													<code>{copy.promptLocation}</code>
													<input
														checked={profile.promptSources[source]}
														onChange={(event) => updatePromptSource(source, event.target.checked)}
														type="checkbox"
													/>
													<span aria-hidden="true" className="PromptSourceSwitch"><span /></span>
												</label>
											)
										})}
									</div>
								</PromptSection>

								{hasProfileChanges || isSavingProfile || profileError ? (
									<div className="AgentProfileSave">
										<div aria-live="polite">
											{profileError ? <span className="AgentProfileSave-error">{profileError}</span> : null}
											{hasProfileChanges && !profileError ? <span>Unsaved changes</span> : null}
										</div>
										<button className="MemoryPrimaryButton" disabled={!hasProfileChanges || isSavingProfile} type="submit">
											{isSavingProfile ? 'Saving…' : 'Save agent settings'}
										</button>
									</div>
								) : null}
								<span aria-live="polite" className="MemorySaveAnnouncement">
									{profileSaved ? 'Agent settings saved.' : ''}
								</span>
							</form>

							<section aria-labelledby="saved-memories-heading" className="MemoryRecords" id="agent-memory">
								<div className="PromptSectionHeading">
									<div>
										<code>{'<user-memory>'}</code>
										<h2 id="saved-memories-heading">Individual memories</h2>
										<p>Add a fact yourself, or approve one that the agent proposes in chat.</p>
									</div>
									<button
										aria-controls="memory-add-form"
										aria-expanded={isMemoryFormOpen}
										className="MemoryAddToggle"
										onClick={() => setIsMemoryFormOpen((current) => !current)}
										type="button"
									>
										<IconPlus aria-hidden="true" size={15} stroke={2} />
										{isMemoryFormOpen ? 'Close' : 'Add a memory'}
									</button>
								</div>

								{isMemoryFormOpen ? (
									<form className="MemoryAddForm" id="memory-add-form" onSubmit={(event) => void addMemory(event)}>
										<div className="MemoryAddForm-grid">
											<label>
												<span>Label</span>
												<input
													maxLength={120}
													onChange={(event) => setNewMemory((current) => ({ ...current, title: event.target.value }))}
													placeholder="Current course"
													required
													value={newMemory.title}
												/>
											</label>
											<label>
												<span>Topic</span>
												<input
													maxLength={100}
													onChange={(event) => setNewMemory((current) => ({ ...current, topic: event.target.value }))}
													placeholder="Chemistry"
													required
													value={newMemory.topic}
												/>
											</label>
											<label>
												<span>Type</span>
												<select
													onChange={(event) => setNewMemory((current) => ({
														...current,
														kind: event.target.value as AgentMemoryKind,
													}))}
													value={newMemory.kind}
												>
													{(Object.entries(memoryKindLabels) as Array<[AgentMemoryKind, string]>).map(([value, label]) => (
														<option key={value} value={value}>{label}</option>
													))}
												</select>
											</label>
										</div>
										<label className="MemoryAddForm-content">
											<span>What should the agent remember?</span>
											<textarea
												maxLength={800}
												onChange={(event) => setNewMemory((current) => ({ ...current, content: event.target.value }))}
												placeholder="I am reviewing reaction mechanisms for an exam in August."
												required
												rows={3}
												value={newMemory.content}
											/>
											<small>{newMemory.content.length}/800</small>
										</label>
										<div className="MemoryAddForm-footer">
											<span>Do not store passwords, financial details, health information, or private identifiers.</span>
											<button className="MemoryPrimaryButton" disabled={isAddingMemory} type="submit">
												{isAddingMemory ? 'Adding…' : 'Add memory'}
											</button>
										</div>
									</form>
								) : null}

								{memoryError ? <p className="MemoryInlineError" role="alert">{memoryError}</p> : null}

								{memories.length ? (
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
										<p>Add one above, or ask the agent to remember something in chat.</p>
									</div>
								)}
							</section>
						</main>
					</div>
				)}
			</div>
		</WorkspaceShell>
	)
}

function PromptSection({
	children,
	description,
	id,
	promptLocation,
	title,
}: {
	children: React.ReactNode
	description: string
	id: string
	promptLocation: string
	title: string
}) {
	return (
		<section className="PromptSection" id={id}>
			<div className="PromptSectionHeading">
				<div>
					<code>{promptLocation}</code>
					<h2>{title}</h2>
					<p>{description}</p>
				</div>
			</div>
			{children}
		</section>
	)
}

function formatDate(value: string) {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? 'Unknown date' : dateFormatter.format(date)
}
