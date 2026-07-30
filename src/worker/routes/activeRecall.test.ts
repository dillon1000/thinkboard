import type { ActiveRecallGradeRequest } from '@agentboard/shared'
import { describe, expect, it } from 'vitest'
import {
	gradeActiveRecall,
	parseActiveRecallGrade,
} from './activeRecall'

const request: ActiveRecallGradeRequest = {
	canvasContext: {
		boardID: 'board-1',
		relatedShapes: [],
		relationships: [],
		selection: [],
		selectionImage: {
			data: 'aGFuZHdyaXRpbmc=',
			height: 600,
			mediaType: 'image/jpeg',
			width: 800,
		},
	},
	explanation: '',
	mode: 'handwriting-check',
	sourceText: 'The derivative of x squared is 2x.',
	topic: 'Differentiate x squared',
}

const grade = {
	nextStep: 'Replace the exponent with its coefficient.',
	score: 60,
	steps: [{
		feedback: 'This line drops the coefficient.',
		label: 'Step 2',
		region: { h: 0.14, w: 0.4, x: 0.2, y: 0.5 },
		status: 'incorrect',
	}],
	strengths: ['The setup is correct.'],
	summary: 'The setup is sound, but the derivative line is wrong.',
	verdict: 'partial',
} as const

describe('active recall grading', () => {
	it('sends selected handwriting with source material and validates the grade', async () => {
		const inputs: unknown[] = []
		const ai = {
			run: (_model: string, input: unknown) => {
				inputs.push(input)
				return Promise.resolve({ response: JSON.stringify(grade) })
			},
		}

		await expect(gradeActiveRecall(ai, 'vision-model', request)).resolves.toEqual(grade)
		expect(JSON.stringify(inputs[0])).toContain(
			'data:image/jpeg;base64,aGFuZHdyaXRpbmc='
		)
		expect(JSON.stringify(inputs[0])).toContain('derivative of x squared')
	})

	it('rejects annotation regions outside the selected image', () => {
		expect(() => parseActiveRecallGrade({
			response: JSON.stringify({
				...grade,
				steps: [{
					...grade.steps[0],
					region: { h: 0.3, w: 0.4, x: 0.8, y: 0.5 },
				}],
			}),
		})).toThrow()
	})
})
