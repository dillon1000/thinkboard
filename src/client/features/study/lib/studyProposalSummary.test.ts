import { describe, expect, it } from 'vitest'
import { getProposalPreview } from './studyProposalSummary'

describe('getProposalPreview', () => {
	it('previews flashcard prompts without revealing their answers', () => {
		const preview = getProposalPreview('createFlashcards', {
			x: 10,
			y: 20,
			cards: [
				{ front: 'What is the derivative of x²?', back: '2x' },
				{ front: 'What is the derivative of sin(x)?', back: 'cos(x)' },
			],
		})

		expect(preview.details.map(({ value }) => value)).toEqual([
			'What is the derivative of x²?',
			'What is the derivative of sin(x)?',
		])
		expect(JSON.stringify(preview)).not.toContain('2x')
		expect(JSON.stringify(preview)).not.toContain('cos(x)')
	})

	it('previews a quiz without identifying or explaining the correct answer', () => {
		const preview = getProposalPreview('createQuiz', {
			x: 10,
			y: 20,
			question: 'Which value equals 2³?',
			options: ['5', '6', '8'],
			correctIndex: 2,
			explanation: 'Two multiplied by itself three times equals eight.',
		})

		expect(preview.details).toEqual([
			{ label: 'Question', value: 'Which value equals 2³?' },
			{ label: 'Choices', value: '5 · 6 · 8' },
		])
		expect(JSON.stringify(preview)).not.toContain('correctIndex')
		expect(JSON.stringify(preview)).not.toContain('multiplied by itself')
	})

	it('previews walkthrough prompts without revealing the worked explanations', () => {
		const preview = getProposalPreview('createWalkthrough', {
			x: 10,
			y: 20,
			title: 'Solve a linear equation',
			steps: [
				{ prompt: 'What should you subtract first?', explanation: 'Subtract two from both sides.' },
				{ prompt: 'What should you divide by?', explanation: 'Divide both sides by three.' },
			],
		})

		expect(preview.details.map(({ value }) => value)).toEqual([
			'Solve a linear equation',
			'What should you subtract first?',
			'What should you divide by?',
		])
		expect(JSON.stringify(preview)).not.toContain('Subtract two')
		expect(JSON.stringify(preview)).not.toContain('Divide both')
	})

	it('summarizes a native composition by objects and layouts', () => {
		const preview = getProposalPreview('composeCanvas', {
			version: 1,
			planID: 'diagram',
			elements: [
				{ id: 'one', kind: 'geo', text: 'One' },
				{ id: 'two', kind: 'geo', text: 'Two' },
			],
			layouts: [{ id: 'row', type: 'stack', items: ['one', 'two'] }],
			connectors: [{
				id: 'edge',
				from: { type: 'element', id: 'one' },
				to: { type: 'element', id: 'two' },
			}],
		})

		expect(preview.details).toEqual(expect.arrayContaining([
			{ label: 'Shapes', value: '2' },
			{ label: 'Connectors', value: '1' },
			{ label: 'Layouts', value: 'stack' },
		]))
	})

	it('shows the exact memory that requires approval', () => {
		const preview = getProposalPreview('saveMemory', {
			content: 'Prefers one hint at a time before seeing a full solution.',
			kind: 'preference',
			memoryKey: 'hint-pacing',
			title: 'Hint pacing',
			topic: 'Study style',
		})

		expect(preview.details).toEqual([
			{ label: 'Remember', value: 'Prefers one hint at a time before seeing a full solution.' },
			{ label: 'Topic', value: 'Study style' },
			{ label: 'Type', value: 'Preference' },
		])
	})

	it('previews a cited study pack without revealing answers', () => {
		const preview = getProposalPreview('createStudyPack', {
			x: 10,
			y: 20,
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

		expect(preview.details).toEqual(expect.arrayContaining([
			{ label: 'Pack', value: 'Cell energy' },
			{ label: 'Sources', value: 'Biology notes, p. 12' },
		]))
		expect(JSON.stringify(preview)).not.toContain('Usable chemical energy')
		expect(JSON.stringify(preview)).not.toContain('Cellular respiration')
	})
})
