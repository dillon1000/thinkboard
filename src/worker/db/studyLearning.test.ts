import { describe, expect, it } from 'vitest'
import { calculateReviewSchedule } from './studyLearning'

describe('calculateReviewSchedule', () => {
	it('resets a forgotten card and lowers its ease', () => {
		expect(calculateReviewSchedule({ easeFactor: 2.5, intervalDays: 12, repetition: 3 }, 'again')).toEqual({
			easeFactor: 2.3,
			intervalDays: 1,
			repetition: 0,
		})
	})

	it('graduates successful cards to longer intervals', () => {
		const first = calculateReviewSchedule({ easeFactor: 2.5, intervalDays: 0, repetition: 0 }, 'good')
		const second = calculateReviewSchedule(first, 'good')
		const third = calculateReviewSchedule(second, 'good')
		expect([first.intervalDays, second.intervalDays, third.intervalDays]).toEqual([1, 6, 15])
	})

	it('gives easy cards an immediate bonus interval', () => {
		expect(calculateReviewSchedule({ easeFactor: 2.5, intervalDays: 0, repetition: 0 }, 'easy')).toMatchObject({
			easeFactor: 2.65,
			intervalDays: 4,
			repetition: 1,
		})
	})
})
