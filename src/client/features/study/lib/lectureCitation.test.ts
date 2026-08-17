import { describe, expect, it } from 'vitest'
import {
	findLectureCitationShape,
	parseLectureCitationHref,
} from './lectureCitation'

describe('parseLectureCitationHref', () => {
	it('parses an encoded lecture citation target', () => {
		expect(parseLectureCitationHref('#lecture=lecture%2Fone&t=92.5')).toEqual({
			lectureID: 'lecture/one',
			startSecond: 92.5,
		})
	})

	it('rejects external and invalid citation links', () => {
		expect(parseLectureCitationHref('https://example.com')).toBeNull()
		expect(parseLectureCitationHref('#lecture=lecture&t=-1')).toBeNull()
		expect(parseLectureCitationHref('#lecture=&t=4')).toBeNull()
	})
})

describe('findLectureCitationShape', () => {
	it('finds the matching lecture player among canvas shapes', () => {
		const matching = {
			props: { lectureID: 'lecture-one' },
			type: 'agentboard-lecture',
		}
		const shapes = [
			{ props: {}, type: 'note' },
			matching,
		]

		expect(findLectureCitationShape(shapes, {
			lectureID: 'lecture-one',
			startSecond: 30,
		})).toBe(matching)
	})
})
