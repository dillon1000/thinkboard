import { describe, expect, it } from 'vitest'
import { looksLikeLeakedProposal, parseLeakedProposal } from './studyProposal'

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
})

describe('looksLikeLeakedProposal', () => {
	it('recognizes a supported call while it is still streaming', () => {
		expect(looksLikeLeakedProposal('{"name":"addReviewNote"')).toBe(true)
		expect(looksLikeLeakedProposal('An ordinary response about review notes.')).toBe(false)
	})
})
