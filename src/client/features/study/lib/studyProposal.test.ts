import { describe, expect, it } from 'vitest'
import { hasProviderToolCallEnvelope, parseLeakedProposal } from './studyProposal'

const reviewCall = {
	name: 'addReviewNote',
	parameters: {
		x: 150,
		y: 20,
		title: 'Correction',
		body: 'The correct equation is $3+3=6$.',
		severity: 'correction',
	},
}

describe('parseLeakedProposal', () => {
	it('recovers a narrated review-note call containing inline math', () => {
		const text = `I will add this correction to the canvas.\n${JSON.stringify(reviewCall)}`

		expect(parseLeakedProposal(text)).toEqual({
			input: reviewCall.parameters,
			toolName: 'addReviewNote',
		})
	})

	it('recovers a code-fenced array of flashcards', () => {
		const call = [{
			name: 'createFlashcards',
			arguments: {
				x: 40,
				y: 50,
				cards: [
					{ front: 'Solve $x+2=4$', back: '$x=2$' },
					{ front: 'Solve $2x=8$', back: '$x=4$' },
				],
			},
		}]

		expect(parseLeakedProposal(`\`\`\`json\n${JSON.stringify(call)}\n\`\`\``)).toEqual({
			input: call[0].arguments,
			toolName: 'createFlashcards',
		})
	})

	it('recovers OpenAI-style string arguments for a quiz', () => {
		const input = {
			x: 10,
			y: 20,
			question: 'What is $2^3$?',
			options: ['$5$', '$6$', '$8$'],
			correctIndex: 2,
			explanation: '$2^3=8$.',
		}
		const call = { type: 'function', function: { name: 'createQuiz', arguments: JSON.stringify(input) } }

		expect(parseLeakedProposal(JSON.stringify(call))).toEqual({
			input,
			toolName: 'createQuiz',
		})
	})

	it('recovers provider-style flat arguments', () => {
		const { parameters, ...call } = reviewCall
		expect(parseLeakedProposal(JSON.stringify({ ...call, ...parameters }))).toEqual({
			input: parameters,
			toolName: 'addReviewNote',
		})
	})

	it('rejects unknown or invalid calls', () => {
		expect(parseLeakedProposal('{"name":"deleteEverything","parameters":{}}')).toBeNull()
		expect(parseLeakedProposal('{"name":"addReviewNote","parameters":{"x":20}}')).toBeNull()
	})

	it('recovers an approved mistake-record proposal', () => {
		const input = {
			concept: 'Algebra',
			description: 'The negative sign was not distributed to both terms.',
			patternKey: 'negative-distribution',
			shapeIDs: ['shape:work'],
			title: 'Distributing a negative sign',
		}
		expect(parseLeakedProposal(JSON.stringify({ name: 'recordMistake', parameters: input }))).toEqual({
			input,
			toolName: 'recordMistake',
		})
	})

	it('recovers a narrated equation call', () => {
		const call = {
			toolName: 'writeEquation',
			input: {
				x: 120,
				y: 240,
				lines: ['ax^2 + bx + c = 0', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'],
			},
		}

		expect(parseLeakedProposal(`Here is the derivation.\n${JSON.stringify(call)}`)).toEqual({
			input: call.input,
			toolName: 'writeEquation',
		})
	})

	it('recovers a native canvas composition', () => {
		const input = {
			version: 1,
			planID: 'two-boxes',
			elements: [
				{ id: 'one', kind: 'geo', text: 'One' },
				{
					id: 'two',
					kind: 'geo',
					text: 'Two',
					placement: { relation: 'east', of: { type: 'element', id: 'one' } },
				},
			],
		}

		expect(parseLeakedProposal(JSON.stringify({ name: 'composeCanvas', input }))).toEqual({
			input,
			toolName: 'composeCanvas',
		})
	})

	it('recovers a Workers AI canvas tool envelope using native-shape arguments', () => {
		const input = {
			baseDocumentClock: 7,
			delete: [],
			create: [{
				id: 'step',
				type: 'geo',
				x: 200,
				y: 300,
				props: {
					geo: 'rectangle',
					w: 260,
					h: 80,
					color: 'agent-blue',
					fill: 'solid',
					text: '<p>Start here</p>',
				},
			}],
		}
		const text = [
			'<|tool_calls_section_begin|>',
			'<|tool_call_begin|>functions.composeCanvas:3',
			'<|tool_call_argument_begin|>',
			JSON.stringify(input),
			'<|tool_call_end|>',
			'<|tool_calls_section_end|>',
		].join('')

		expect(parseLeakedProposal(text)).toMatchObject({
			input: {
				version: 1,
				baseDocumentClock: 7,
				elements: [{ id: 'step', kind: 'geo', text: 'Start here' }],
			},
			toolName: 'composeCanvas',
		})
		expect(hasProviderToolCallEnvelope(text)).toBe(true)
	})
})
