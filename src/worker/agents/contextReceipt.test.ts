import { DEFAULT_AGENT_PROFILE } from '@agentboard/shared'
import { describe, expect, it } from 'vitest'
import { buildContextReceipt } from './contextReceipt'

describe('buildContextReceipt', () => {
	it('lists source metadata without copying source content', () => {
		const receipt = buildContextReceipt({
			canvasContext: {
				boardID: 'board-1',
				selection: [{ id: 'shape:1', type: 'note', x: 0, y: 0, w: 100, h: 100, rotation: 0 }],
				relatedShapes: [],
				relationships: [],
				viewport: { x: 0, y: 0, w: 800, h: 600, zoom: 1, shapes: [] },
			},
			craftContext: [{ blocks: [], linkID: 'craft-1', markdown: 'private text', title: 'Lab notes' }],
			memories: [{
				content: 'private memory',
				count: 1,
				kind: 'goal',
				lastSavedAt: '2026-07-29T00:00:00.000Z',
				memoryKey: 'goal',
				title: 'Goal',
				topic: 'Biology',
			}],
			profile: {
				...DEFAULT_AGENT_PROFILE,
				aboutUser: 'private profile',
			},
			retrieval: [{
				chunkText: 'private PDF text',
				documentID: 'pdf-1',
				documentTitle: 'Biology',
				pageNumber: 7,
				score: 0.9,
				sourceKind: 'pdf',
			}],
			spotifyPlayback: null,
		})

		expect(receipt).toMatchObject({
			board: { selectedShapeTypes: ['note'], visibleShapeCount: 0 },
			craftDocuments: ['Lab notes'],
			memories: 1,
			lectureSources: [],
			pdfSources: [{ documentID: 'pdf-1', documentTitle: 'Biology', pageNumber: 7 }],
			profileFields: ['personality', 'about-you'],
			spotify: { state: 'idle' },
		})
		expect(JSON.stringify(receipt)).not.toContain('private')
	})
})
