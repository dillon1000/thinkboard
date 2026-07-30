import { describe, expect, it } from 'vitest'
import { buildExamTasks, parseQuizArtifacts } from './exams'

describe('exam planning', () => {
	it('alternates review, mistake, and practice tasks until the exam', () => {
		const tasks = buildExamTasks(
			'2026-08-03',
			[{ boardID: 'board-a', boardTitle: 'Biology', dueCards: 6, totalCards: 20 }],
			[{
				boardID: 'board-a',
				concept: 'Mitosis',
				count: 3,
				description: 'Mixed up the phases',
				patternKey: 'mitosis-order',
				title: 'Phase order',
			}],
			new Date('2026-07-30T12:00:00Z')
		)

		expect(tasks).toHaveLength(4)
		expect(tasks.map(({ kind }) => kind)).toEqual(['review', 'mistake', 'practice', 'review'])
		expect(tasks[0].label).toContain('6 due cards')
	})

	it('uses only valid stored quiz payloads', () => {
		expect(parseQuizArtifacts([
			{
				payload: JSON.stringify({
					correctIndex: 1,
					explanation: 'Because B is supported.',
					options: ['A', 'B'],
					question: 'Which answer is supported?',
				}),
			},
			{ payload: '{"question":"broken"}' },
		])).toHaveLength(1)
	})
})
