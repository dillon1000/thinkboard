import { describe, expect, it } from 'vitest'
import { ensurePDFCompatibility } from './pdfCompatibility'

interface TestPromiseResolvers<T> {
	promise: Promise<T>
	resolve: (value: T | PromiseLike<T>) => void
}

describe('ensurePDFCompatibility', () => {
	it('installs the APIs required by PDF.js on older browsers', async () => {
		const originalWithResolvers = Reflect.get(Promise, 'withResolvers')
		const originalAbortSignalAny = Reflect.get(AbortSignal, 'any')
		let resolvers: TestPromiseResolvers<number> | null = null
		try {
			Reflect.set(Promise, 'withResolvers', undefined)
			Reflect.set(AbortSignal, 'any', undefined)

			ensurePDFCompatibility()
			const withResolvers = Reflect.get(Promise, 'withResolvers')
			const combineSignals = Reflect.get(AbortSignal, 'any')
			expect(withResolvers).toBeTypeOf('function')
			expect(combineSignals).toBeTypeOf('function')

			resolvers = Reflect.apply(withResolvers, Promise, []) as TestPromiseResolvers<number>
			const firstController = new AbortController()
			const secondController = new AbortController()
			const combined = Reflect.apply(combineSignals, AbortSignal, [[
				firstController.signal,
				secondController.signal,
			]]) as AbortSignal
			secondController.abort('cancelled')
			expect(combined.aborted).toBe(true)
			expect(Reflect.get(combined, 'reason')).toBe('cancelled')

			const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
			const loadingTask = pdfjs.getDocument({
				data: new TextEncoder().encode('%PDF-1.4\n'),
			})
			let PDFError: unknown = null
			try {
				await loadingTask.promise
			} catch (error) {
				PDFError = error
			} finally {
				await loadingTask.destroy()
			}
			expect(PDFError).not.toBeNull()
			expect(PDFError).not.toBeInstanceOf(TypeError)
		} finally {
			Reflect.set(Promise, 'withResolvers', originalWithResolvers)
			Reflect.set(AbortSignal, 'any', originalAbortSignalAny)
		}

		resolvers?.resolve(42)
		await expect(resolvers?.promise).resolves.toBe(42)
	})
})
