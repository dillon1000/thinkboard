import { describe, expect, it } from 'vitest'
import {
	buildReviewTrend,
	calculateReviewSchedule,
	calculateReviewStreak,
} from './studyLearning'

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

describe('review history summaries', () => {
	it('builds a stable seven-day trend from append-only events', () => {
		const now = new Date('2026-07-29T18:00:00.000Z')
		const trend = buildReviewTrend([
			{ rating: 'good', reviewedAt: new Date('2026-07-29T12:00:00.000Z') },
			{ rating: 'again', reviewedAt: new Date('2026-07-29T13:00:00.000Z') },
			{ rating: 'easy', reviewedAt: new Date('2026-07-27T13:00:00.000Z') },
		], now)

		expect(trend).toHaveLength(7)
		expect(trend.at(-1)).toEqual({ day: '2026-07-29', remembered: 1, reviewed: 2 })
		expect(trend.at(-3)).toEqual({ day: '2026-07-27', remembered: 1, reviewed: 1 })
	})

	it('counts a streak that can continue from yesterday', () => {
		const now = new Date('2026-07-29T18:00:00.000Z')
		expect(calculateReviewStreak([
			new Date('2026-07-28T12:00:00.000Z'),
			new Date('2026-07-27T12:00:00.000Z'),
			new Date('2026-07-25T12:00:00.000Z'),
		], now)).toBe(2)
	})
})
