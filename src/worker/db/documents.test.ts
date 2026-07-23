import { describe, expect, it, vi } from 'vitest'
import type { Database } from './client'
import { replaceDocumentChunks } from './documents'

describe('replaceDocumentChunks', () => {
	it('keeps each insert within the D1 bound-parameter limit', async () => {
		const insertedBatches: unknown[][] = []
		const where = vi.fn().mockResolvedValue(undefined)
		const database = {
			delete: vi.fn(() => ({ where })),
			insert: vi.fn(() => ({
				values: vi.fn(async (values: unknown[]) => {
					insertedBatches.push(values)
				}),
			})),
		} as unknown as Database
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
