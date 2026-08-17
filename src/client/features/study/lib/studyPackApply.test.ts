import { Editor, type TLShapePartial } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { applyProposal } from './studyProposalApply'

describe('applyProposal study pack', () => {
	it('creates one cited artifact group and registers its flashcards', () => {
		const createdShapes: TLShapePartial[] = []
		const fixture = {
			createShape: (shape: TLShapePartial) => {
				createdShapes.push(shape)
			},
			createShapes: (shapes: TLShapePartial[]) => {
				createdShapes.push(...shapes)
			},
			markHistoryStoppingPoint: vi.fn(),
			run: (callback: () => void) => callback(),
			setSelectedShapes: vi.fn(),
		}
		// SAFETY: The fixture implements every Editor method used by applyProposal in this test.
		const editor = Object.assign(Object.create(Editor.prototype), fixture) as Editor

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
		const dimensions = z.object({ h: z.number(), w: z.number() })
		expect(flashcards.every((shape) => {
			const props = dimensions.safeParse(shape.props)
			return props.success && props.data.w === 220 && props.data.h === 118
		})).toBe(true)
		expect(effect.flashcards).toHaveLength(2)
		expect(effect.shapeIDs).toHaveLength(4)
	})
})
