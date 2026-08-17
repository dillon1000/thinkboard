import { readProperty } from '@agentboard/shared'
import type { Editor } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { applyProposal } from './studyProposalApply'

describe('applyProposal study pack', () => {
	it('creates one cited artifact group and registers its flashcards', () => {
		const createdShapes: Array<Record<string, unknown>> = []
		const editor = {
			createShape: (shape: Record<string, unknown>) => {
				createdShapes.push(shape)
			},
			createShapes: (shapes: Array<Record<string, unknown>>) => {
				createdShapes.push(...shapes)
			},
			markHistoryStoppingPoint: vi.fn(),
			run: (callback: () => void) => callback(),
			setSelectedShapes: vi.fn(),
		} as unknown as Editor

		const effect = applyProposal(editor, 'createStudyPack', {
			x: 100,
			y: 200,
			title: 'Cell energy',
			sources: [{
				documentID: 'biology-notes',
				documentTitle: 'Biology notes',
				pageNumber: 12,
			}],
			cards: [
				{ front: 'What does ATP carry?', back: 'Usable chemical energy.' },
				{ front: 'Where is ATP produced?', back: 'Mostly in mitochondria.' },
			],
			quizzes: [{
				question: 'Which organelle produces most ATP?',
				options: ['Nucleus', 'Mitochondrion'],
				correctIndex: 1,
				explanation: 'Cellular respiration occurs in mitochondria.',
			}],
			conceptMap: {
				title: 'Energy flow',
				nodes: [
					{ id: 'glucose', label: 'Glucose', x: 0.2, y: 0.5 },
					{ id: 'atp', label: 'ATP', x: 0.8, y: 0.5 },
				],
				edges: [{ from: 'glucose', to: 'atp', label: 'is converted into' }],
			},
		})

		expect(createdShapes.map((shape) => shape.type)).toEqual([
			'frame',
			'agentboard-concept-map',
			'agentboard-flashcard',
			'agentboard-flashcard',
			'agentboard-quiz',
		])
		expect(createdShapes.slice(1).every((shape) =>
			JSON.stringify(shape.meta).includes('"documentID":"biology-notes"')
		)).toBe(true)
		const flashcards = createdShapes.filter((shape) => shape.type === 'agentboard-flashcard')
		expect(flashcards.every((shape) => (
			readProperty(shape.props as object, 'w') === 220
			&& readProperty(shape.props as object, 'h') === 118
		))).toBe(true)
		expect(effect.flashcards).toHaveLength(2)
		expect(effect.shapeIDs).toHaveLength(4)
	})
})
