import { describe, expect, it, vi } from 'vitest'
import type { Database } from './client'
import {
	getPageTextForDocuments,
	replaceDocumentChunks,
	setDocumentStatus,
} from './documents'

function databaseFixture<Fixture extends object>(fixture: Fixture) {
	// SAFETY: Each fixture implements the complete fluent database path exercised by its test.
	return Object.assign(Object.create(null), fixture) as Database
}

function createDocumentStatusDatabase(
	updateResults: Array<'resolve' | 'reject'>,
	storedStatus: { failureReason: string | null; status: string }
) {
	const updateWhere = vi.fn(async () => {
		const result = updateResults.shift() ?? 'resolve'
		if (result === 'reject') throw new Error('D1 write response failed')
	})
	const limit = vi.fn().mockResolvedValue([storedStatus])
	const database = databaseFixture({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({ limit })),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: updateWhere })),
		})),
	})
	return { database, limit, updateWhere }
}

describe('setDocumentStatus', () => {
	it('accepts a status write that committed before D1 reported an error', async () => {
		const { database, limit, updateWhere } = createDocumentStatusDatabase(
			['reject'],
			{ failureReason: null, status: 'processing' }
		)

		await setDocumentStatus(database, 'document-id', 'processing')

		expect(updateWhere).toHaveBeenCalledOnce()
		expect(limit).toHaveBeenCalledOnce()
	})

	it('retries when the requested status is not stored', async () => {
		const { database, updateWhere } = createDocumentStatusDatabase(
			['reject', 'resolve'],
			{ failureReason: null, status: 'processing' }
		)

		await setDocumentStatus(database, 'document-id', 'ready')

		expect(updateWhere).toHaveBeenCalledTimes(2)
	})

	it('throws after two failed writes when neither one commits', async () => {
		const { database, updateWhere } = createDocumentStatusDatabase(
			['reject', 'reject'],
			{ failureReason: null, status: 'processing' }
		)

		await expect(setDocumentStatus(database, 'document-id', 'ready')).rejects.toThrow(
			'D1 write response failed'
		)
		expect(updateWhere).toHaveBeenCalledTimes(2)
	})
})

describe('replaceDocumentChunks', () => {
	it('keeps each insert within the D1 bound-parameter limit', async () => {
		const insertedBatches: unknown[][] = []
		const where = vi.fn().mockResolvedValue(undefined)
		const database = databaseFixture({
			delete: vi.fn(() => ({ where })),
			insert: vi.fn(() => ({
				values: vi.fn(async (values: unknown[]) => {
					insertedBatches.push(values)
				}),
			})),
		})
		const chunks = Array.from({ length: 100 }, (_, index) => ({
			pageNumber: Math.floor(index / 4) + 1,
			vectorID: `document-id:${index}`,
		}))

		await replaceDocumentChunks(database, 'document-id', chunks)

		expect(insertedBatches.map((batch) => batch.length)).toEqual([33, 33, 33, 1])
		expect(insertedBatches.every((batch) => batch.length * 3 <= 100)).toBe(true)
		expect(where).toHaveBeenCalledOnce()
	})
})

describe('getPageTextForDocuments', () => {
	it('batches a full PDF selection within the D1 bound-parameter limit', async () => {
		const where = vi.fn().mockResolvedValue([])
		const database = databaseFixture({
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					innerJoin: vi.fn(() => ({ where })),
				})),
			})),
		})
		const references = Array.from({ length: 200 }, (_, index) => ({
			documentID: 'document-id',
			pageNumber: index + 1,
		}))

		await getPageTextForDocuments(database, 'board-id', references)

		expect(where).toHaveBeenCalledTimes(5)
	})
})
