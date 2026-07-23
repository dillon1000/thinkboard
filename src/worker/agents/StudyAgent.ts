import {
	DEFAULT_STUDY_MODEL_MODE,
	canvasContextSchema,
	conceptMapProposalSchema,
	flashcardProposalSchema,
	getStudyModel,
	mistakeProposalSchema,
	practiceSetProposalSchema,
	quizProposalSchema,
	reviewProposalSchema,
	studyModelModeSchema,
	studyModeSchema,
	walkthroughProposalSchema,
	type ConceptMapProposal,
	type FlashcardProposal,
	type MistakeProposal,
	type PracticeSetProposal,
	type QuizProposal,
	type ReviewProposal,
	type StudyMessageMetadata,
	type WalkthroughProposal,
} from '@agentboard/shared'
import { DurableObject } from 'cloudflare:workers'
import {
	convertToModelMessages,
	safeValidateUIMessages,
	stepCountIs,
	streamText,
	tool,
	validateUIMessages,
	type UIMessage,
} from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'
import { createDatabase } from '../db/client'
import {
	createStudyAgentDatabase,
	loadStudyMessages,
	migrateStudyAgentDatabase,
	replaceStudyMessages,
	type StudyAgentDatabase,
} from '../db/studyAgent'
import { listMistakePatterns } from '../db/studyLearning'
import { attachCanvasContext } from './canvasContext'
import { hydratePDFSelectionContext } from './pdfContext'
import {
	attachDocumentRetrieval,
	retrieveBoardDocuments,
} from '../documents/retrieval'
import { getRequestedStudyTool } from './studyToolIntent'
import {
	getStudyToolContinuation,
	getStudyToolContinuationInstruction,
} from './studyToolContinuation'

const MAX_PERSISTED_MESSAGES = 100
const proposalOutputSchema = z.object({ applied: z.boolean() })

const studyTools = {
	addReviewNote: tool({
		description: 'Create one canvas review-note proposal beside the selected work. The browser asks the student before adding it and returns whether it was applied.',
		inputSchema: reviewProposalSchema,
		outputSchema: proposalOutputSchema,
	}),
	createFlashcards: tool({
		description: 'Create one proposal containing two to six interactive canvas flashcards. Keep every back hidden from visible assistant text.',
		inputSchema: flashcardProposalSchema,
		outputSchema: proposalOutputSchema,
	}),
	createQuiz: tool({
		description: 'Create one interactive multiple-choice canvas quiz proposal. Keep the answer and explanation hidden from visible assistant text.',
		inputSchema: quizProposalSchema,
		outputSchema: proposalOutputSchema,
	}),
	createWalkthrough: tool({
		description: 'Create one student-paced worked-example walkthrough. Each step asks the student to attempt something before revealing the explanation.',
		inputSchema: walkthroughProposalSchema,
		outputSchema: proposalOutputSchema,
	}),
	createConceptMap: tool({
		description: 'Create one visual concept map from the current board material, with concise nodes and labeled relationships.',
		inputSchema: conceptMapProposalSchema,
		outputSchema: proposalOutputSchema,
	}),
	createPracticeSet: tool({
		description: 'Create two to five new practice problems modeled on selected examples. They become separate interactive quiz shapes and must not copy the source verbatim.',
		inputSchema: practiceSetProposalSchema,
		outputSchema: proposalOutputSchema,
	}),
	recordMistake: tool({
		description: 'Propose recording a specific student mistake for longitudinal tracking. Use only after identifying a concrete error in the student’s work; the student must approve it.',
		inputSchema: mistakeProposalSchema,
		outputSchema: proposalOutputSchema,
	}),
}

type StudyTools = {
	addReviewNote: { input: ReviewProposal; output: { applied: boolean } }
	createFlashcards: { input: FlashcardProposal; output: { applied: boolean } }
	createQuiz: { input: QuizProposal; output: { applied: boolean } }
	createWalkthrough: { input: WalkthroughProposal; output: { applied: boolean } }
	createConceptMap: { input: ConceptMapProposal; output: { applied: boolean } }
	createPracticeSet: { input: PracticeSetProposal; output: { applied: boolean } }
	recordMistake: { input: MistakeProposal; output: { applied: boolean } }
}

type StudyUIMessage = UIMessage<StudyMessageMetadata, Record<string, never>, StudyTools>

const chatRequestSchema = z.object({
	canvasContext: canvasContextSchema.optional(),
	messages: z.unknown(),
	modelMode: studyModelModeSchema.default(DEFAULT_STUDY_MODEL_MODE),
	studyMode: studyModeSchema.default('direct'),
})

export class StudyAgent extends DurableObject<Env> {
	private activeGeneration: AbortController | null = null
	private readonly database: StudyAgentDatabase
	private readonly databaseReady: Promise<void>

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.database = createStudyAgentDatabase(ctx.storage)
		this.databaseReady = ctx.blockConcurrencyWhile(() =>
			migrateStudyAgentDatabase(this.database)
		)
	}

	override async fetch(request: Request): Promise<Response> {
		await this.databaseReady
		if (request.method === 'GET') {
			return Response.json({ messages: await this.loadMessages() })
		}
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 })
		}

		const body: unknown = await request.json().catch(() => null)
		const parsed = chatRequestSchema.safeParse(body)
		if (!parsed.success) {
			return Response.json({ error: 'Invalid chat request' }, { status: 400 })
		}

		let messages: StudyUIMessage[]
		try {
			messages = await validateUIMessages<StudyUIMessage>({
				messages: parsed.data.messages,
				tools: studyTools,
			})
		} catch (error) {
			console.error('Invalid study chat messages', error)
			return Response.json({ error: 'Invalid chat messages' }, { status: 400 })
		}

		this.activeGeneration?.abort()
		const generation = new AbortController()
		this.activeGeneration = generation
		request.signal.addEventListener('abort', () => generation.abort(), { once: true })

		const boardID = request.headers.get('x-agentboard-board-id')
		if (!boardID) return Response.json({ error: 'Missing authorized board identity' }, { status: 400 })
		const applicationDatabase = createDatabase(this.env)
		let canvasContext
		try {
			canvasContext = await hydratePDFSelectionContext(
				applicationDatabase,
				boardID,
				parsed.data.canvasContext
			)
		} catch (error) {
			console.error('Invalid canvas board identity', error)
			return Response.json({ error: 'Invalid canvas context' }, { status: 400 })
		}
		const queryText = extractLatestUserText(messages)
		const retrieval = await retrieveBoardDocuments(
			this.env,
			applicationDatabase,
			boardID,
			queryText
		).catch((error) => {
			console.error('Document retrieval failed', error)
			return []
		})
		const modelMessages = attachDocumentRetrieval(
			attachCanvasContext(await convertToModelMessages(messages), canvasContext),
			retrieval
		)
		const requestedTool = getRequestedStudyTool(messages)
		const toolContinuation = getStudyToolContinuation(messages)
		const workersAI = createWorkersAI({ binding: this.env.AI })
		const modelMode = parsed.data.modelMode
		const model = getStudyModel(modelMode)
		const modelID = modelMode === 'quicker'
			? this.env.AI_MODEL ?? model.id
			: model.id
		const userID = request.headers.get('x-agentboard-user-id')
		const mistakePatterns = userID
			? await listMistakePatterns(applicationDatabase, userID)
			: []
		const mistakeContext = mistakePatterns.length
			? `\n<learning-history>\nApproved mistake patterns from this student:\n${mistakePatterns.map((pattern) => `- ${pattern.title} (${pattern.concept}): ${pattern.count} occurrence${pattern.count === 1 ? '' : 's'}. ${pattern.description}`).join('\n')}\nUse this history gently and only when relevant. Never imply that an unapproved observation was recorded.\n</learning-history>`
			: ''
		const studyModeInstruction = parsed.data.studyMode === 'socratic'
			? 'Socratic mode is ON. Ask one focused guiding question at a time, wait for the student’s attempt, and offer the smallest useful hint. Do not provide the final answer unless the student explicitly asks to leave Socratic mode.'
			: 'Direct mode is ON. Explain clearly while still inviting the student to reason.'

		const result = streamText({
			model: workersAI(modelID),
			system: `<role>
You are Agentboard's study tutor: concise, curious, and academically rigorous. Help the student understand their work instead of merely supplying answers.
${studyModeInstruction}${mistakeContext}
</role>

<canvas-context>
Treat the canvas structure attached to the latest user message as the current board snapshot. Use the document clock as its version stamp, viewport shapes as what the student is looking at, selected shapes as the primary referent, and bindings as explicit diagram relationships. Read legible handwriting, equations, annotations, and diagrams directly. Never reduce visible academic work to “several drawings” or ask the student to retype content you can read.${canvasContext ? '' : ' No current canvas context was provided.'}
</canvas-context>

<response-contract>
- Point out misconceptions clearly and kindly. Separate facts from uncertainty.
- Ask one useful follow-up only when the request is genuinely ambiguous.
- Write math as LaTeX using $...$ inline or $$...$$ on its own line.
- Never claim a board mutation has happened before the browser reports a tool result.${getStudyToolContinuationInstruction(toolContinuation)}
- When you identify a concrete error pattern in selected student work, you may propose recordMistake. Never claim it was saved until approval succeeds.
- When document retrieval supports a factual claim, cite the supplied source using its exact Markdown link, including the document title and page number. Never invent a citation or change its link target.
</response-contract>

<tool-contract>
- Use a proposal tool only when a canvas artifact materially helps the request.
- Emit a native tool call; never print tool names, parameters, JSON, or schema text.
- The student must explicitly add or dismiss each proposal in the interface.
- Never reveal flashcard backs, quiz answers, or quiz explanations in assistant text.
- Use LaTeX delimiters inside tool text fields when needed.
- Put artifacts immediately right of the selection, or near the viewport center when nothing is selected.
- Use createPracticeSet when the student asks for multiple similar problems; use createQuiz for one.
- If the student dismisses a proposal, acknowledge it briefly and do not repeat the tool unless asked.
</tool-contract>`,
			messages: modelMessages,
			tools: studyTools,
			toolChoice: requestedTool
				? { type: 'tool', toolName: requestedTool }
				: toolContinuation
					? 'none'
					: 'auto',
			temperature: 0,
			stopWhen: stepCountIs(15),
			abortSignal: generation.signal,
		})

		return result.toUIMessageStreamResponse<StudyUIMessage>({
			originalMessages: messages,
			messageMetadata: ({ part }) => {
				if (part.type !== 'finish-step') return undefined
				const inputTokens = part.usage.inputTokens ?? 0
				const outputTokens = part.usage.outputTokens ?? 0
				return {
					contextTokens: inputTokens + outputTokens,
					contextWindowTokens: model.contextWindowTokens,
					model: modelID,
					modelMode,
				}
			},
			onError: (error) => {
				console.error('Study chat generation failed', error)
				return 'The study partner could not finish that response.'
			},
			onFinish: ({ messages: completedMessages }) => {
				this.persistMessages(completedMessages)
				if (this.activeGeneration === generation) this.activeGeneration = null
			},
		})
	}

	private async loadMessages(): Promise<StudyUIMessage[]> {
		const storedMessages = loadStudyMessages(this.database)
		if (storedMessages.length === 0) return []
		const validated = await safeValidateUIMessages<StudyUIMessage>({
			messages: storedMessages,
			tools: studyTools,
		})
		const migrated = validated.success
			? validated.data
			: migrateLegacyTextMessages(storedMessages)
		this.persistMessages(migrated)
		return migrated
	}

	private persistMessages(messages: StudyUIMessage[]) {
		replaceStudyMessages(
			this.database,
			messages.slice(-MAX_PERSISTED_MESSAGES)
		)
	}
}

function extractLatestUserText(messages: readonly StudyUIMessage[]) {
	const message = messages.findLast(({ role }) => role === 'user')
	if (!message) return ''
	return message.parts.flatMap((part) => {
		if (!part || typeof part !== 'object' || Reflect.get(part, 'type') !== 'text') return []
		const text = Reflect.get(part, 'text')
		return typeof text === 'string' ? [text] : []
	}).join('\n').trim()
}

function migrateLegacyTextMessages(messages: unknown[]): StudyUIMessage[] {
	return messages.flatMap((message) => {
		if (!message || typeof message !== 'object') return []
		const id = Reflect.get(message, 'id')
		const role = Reflect.get(message, 'role')
		const parts = Reflect.get(message, 'parts')
		if (
			typeof id !== 'string' ||
			(role !== 'system' && role !== 'user' && role !== 'assistant') ||
			!Array.isArray(parts)
		) return []

		const textParts = parts.flatMap((part) => {
			if (!part || typeof part !== 'object') return []
			const type = Reflect.get(part, 'type')
			const text = Reflect.get(part, 'text')
			return type === 'text' && typeof text === 'string'
				? [{ type: 'text' as const, text }]
				: []
		})
		return textParts.length > 0 ? [{ id, role, parts: textParts }] : []
	})
}
