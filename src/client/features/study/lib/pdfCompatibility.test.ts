import { isFunction, readProperty } from '@agentboard/shared'
import type { UntrustedInput } from '@agentboard/shared'
import { describe, expect, it } from 'vitest'
import { ensurePDFCompatibility } from './pdfCompatibility'

interface TestPromiseResolvers<T> {
	promise: Promise<T>
	resolve: (value: T | PromiseLike<T>) => void
}

describe('ensurePDFCompatibility', () => {
	it('installs the APIs required by PDF.js on older browsers', async () => {
		const originalWithResolvers = readProperty(Promise, 'withResolvers')
		const originalAbortSignalAny = readProperty(AbortSignal, 'any')
		let resolvers: TestPromiseResolvers<number> | null = null
		try {
			Reflect.set(Promise, 'withResolvers', undefined)
			Reflect.set(AbortSignal, 'any', undefined)

			ensurePDFCompatibility()
			const withResolvers = readProperty(Promise, 'withResolvers')
			const combineSignals = readProperty(AbortSignal, 'any')
			expect(withResolvers).toBeTypeOf('function')
			expect(combineSignals).toBeTypeOf('function')
			if (!isFunction(withResolvers) || !isFunction(combineSignals)) {
				throw new TypeError('PDF compatibility functions were not installed')
			}

			// SAFETY: The installed Promise API returns the standard resolver contract checked above.
			resolvers = withResolvers.call(Promise) as TestPromiseResolvers<number>
			const firstController = new AbortController()
			const secondController = new AbortController()
			// SAFETY: The installed AbortSignal API returns a signal for the supplied signal list.
			const combined = combineSignals.call(AbortSignal, [
				firstController.signal,
				secondController.signal,
			]) as AbortSignal
			secondController.abort('cancelled')
			expect(combined.aborted).toBe(true)
			expect(readProperty(combined, 'reason')).toBe('cancelled')

			const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
			const loadingTask = pdfjs.getDocument({
				data: new TextEncoder().encode('%PDF-1.4\n'),
			})
			let PDFError: UntrustedInput = null
			try {
				await loadingTask.promise
			} catch (error) {
				PDFError = error instanceof Error ? error : String(error)
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
