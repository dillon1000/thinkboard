import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	createProjectorCode,
	formatProjectorCode,
	formatProjectorTime,
	getProjectorClockHandAngles,
	isProjectorCode,
	normalizeProjectorCode,
	readProjectorPresenceMetadata,
} from './projectorMode'

describe('projector mode', () => {
	afterEach(() => vi.restoreAllMocks())

	it('normalizes and formats a pairing code', () => {
		expect(normalizeProjectorCode('12a 34567')).toBe('123456')
		expect(formatProjectorCode('123456')).toBe('123 456')
		expect(isProjectorCode('123456')).toBe(true)
		expect(isProjectorCode('12345')).toBe(false)
	})

	it('creates a zero-padded six-digit code', () => {
		vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
			;(array as Uint32Array)[0] = 42
			return array
		})

		expect(createProjectorCode()).toBe('000042')
	})

	it('reads only valid projector presence metadata', () => {
		expect(readProjectorPresenceMetadata({
			agentboardProjector: { code: '123456', mode: 'controller' },
		})).toEqual({ code: '123456', mode: 'controller' })
		expect(readProjectorPresenceMetadata({
			agentboardProjector: { code: '123', mode: 'projector' },
		})).toBeNull()
		expect(readProjectorPresenceMetadata({
			agentboardProjector: { code: '123456', mode: 'other' },
		})).toBeNull()
	})

	it('formats clock time with locale rules', () => {
		expect(formatProjectorTime(new Date(2026, 6, 29, 22, 42), 'en-US')).toBe('10:42 PM')
	})

	it('positions analog clock hands from local time', () => {
		expect(getProjectorClockHandAngles(new Date(2026, 6, 29, 10, 42))).toEqual({
			hour: 321,
			minute: 252,
		})
	})
})
