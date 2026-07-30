import type {
	AgentMemory,
	AgentProfile,
	CanvasContext,
	SpotifyPlayback,
	StudyContextReceipt,
} from '@agentboard/shared'
import type { DocumentRetrievalResult } from '../documents/retrieval'
import type { CraftDocumentContext } from '../integrations/craft'

interface ContextReceiptInput {
	canvasContext?: CanvasContext
	craftContext: readonly CraftDocumentContext[]
	memories: readonly AgentMemory[]
	profile: AgentProfile
	retrieval: readonly DocumentRetrievalResult[]
	spotifyPlayback?: SpotifyPlayback | null
}

/**
 * Reports the bounded source metadata supplied to one model response. It does
 * not copy source text, profile values, memory content, or Craft block content.
 */
export function buildContextReceipt(input: ContextReceiptInput): StudyContextReceipt {
	const pdfSources = new Map<string, StudyContextReceipt['pdfSources'][number]>()
	const lectureSources = new Map<string, StudyContextReceipt['lectureSources'][number]>()
	for (const source of input.retrieval) {
		if (source.sourceKind === 'lecture') {
			const key = `${source.lectureID}:${Math.floor(source.startSecond)}`
			if (!lectureSources.has(key)) lectureSources.set(key, {
				lectureID: source.lectureID,
				lectureTitle: source.lectureTitle,
				startSecond: source.startSecond,
			})
		} else {
			addPDFSource(pdfSources, source)
		}
	}
	for (const source of input.canvasContext?.documentText ?? []) {
		addPDFSource(pdfSources, source)
	}
	const profileFields: StudyContextReceipt['profileFields'] = ['personality']
	if (input.profile.promptSources.aboutUser && input.profile.aboutUser) {
		profileFields.push('about-you')
	}
	if (input.profile.promptSources.customInstructions && input.profile.customInstructions) {
		profileFields.push('custom-instructions')
	}

	return {
		...(input.canvasContext ? {
			board: {
				selectedShapeTypes: input.canvasContext.selection.map(({ type }) => type).slice(0, 30),
				visibleShapeCount: input.canvasContext.viewport?.shapes.length ?? 0,
			},
		} : {}),
		craftDocuments: input.craftContext.map(({ title }) => title).slice(0, 10),
		memories: Math.min(input.memories.length, 40),
		lectureSources: [...lectureSources.values()].slice(0, 12),
		pdfSources: [...pdfSources.values()].slice(0, 12),
		profileFields,
		spotify: input.profile.promptSources.connectedServices
			? getSpotifyReceipt(input.spotifyPlayback)
			: { state: 'excluded' },
	}
}

function addPDFSource(
	sources: Map<string, StudyContextReceipt['pdfSources'][number]>,
	source: { documentID: string; documentTitle: string; pageNumber: number }
) {
	const key = `${source.documentID}:${source.pageNumber}`
	if (!sources.has(key)) sources.set(key, {
		documentID: source.documentID,
		documentTitle: source.documentTitle,
		pageNumber: source.pageNumber,
	})
}

function getSpotifyReceipt(
	playback: SpotifyPlayback | null | undefined
): StudyContextReceipt['spotify'] {
	if (playback === undefined) return { state: 'unavailable' }
	if (!playback?.item) return { state: 'idle' }
	return {
		detail: `${playback.item.title} — ${playback.item.subtitle}`,
		state: playback.isPlaying ? 'playing' : 'paused',
	}
}
