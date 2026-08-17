import { describe, expect, it } from 'vitest'
import {
	ensurePDFCompatibility,
	type CompatibleAbortSignalConstructor,
	type CompatiblePromiseConstructor,
	type PromiseResolvers,
} from './pdfCompatibility'

describe('ensurePDFCompatibility', () => {
	it('installs the APIs required by PDF.js on older browsers', async () => {
		const promiseConstructor: CompatiblePromiseConstructor = Promise
		const abortSignalConstructor: CompatibleAbortSignalConstructor = AbortSignal
		const originalWithResolvers = promiseConstructor.withResolvers
		const originalAbortSignalAny = abortSignalConstructor.any
		let resolvers: PromiseResolvers<number> | null = null
		try {
			promiseConstructor.withResolvers = undefined
			abortSignalConstructor.any = undefined

			ensurePDFCompatibility()
			const withResolvers = readWithResolvers()
			const combineSignals = readAbortSignalAny()
			expect(withResolvers).toBeTypeOf('function')
			expect(combineSignals).toBeTypeOf('function')

			if (!withResolvers || !combineSignals) throw new Error('PDF compatibility APIs were not installed')
			resolvers = withResolvers<number>()
			const firstController = new AbortController()
			const secondController = new AbortController()
			const combined = combineSignals([
				firstController.signal,
				secondController.signal,
			])
			secondController.abort('cancelled')
			expect(combined.aborted).toBe(true)
			expect(combined.reason).toBe('cancelled')

			const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
			const loadingTask = pdfjs.getDocument({
				data: new TextEncoder().encode('%PDF-1.4\n'),
			})
			let PDFError: Error | null = null
			try {
				await loadingTask.promise
			} catch (error) {
				PDFError = error instanceof Error ? error : new Error(String(error))
			} finally {
				await loadingTask.destroy()
			}
			expect(PDFError).not.toBeNull()
			expect(PDFError).not.toBeInstanceOf(TypeError)
		} finally {
			promiseConstructor.withResolvers = originalWithResolvers
			abortSignalConstructor.any = originalAbortSignalAny
		}

		resolvers?.resolve(42)
		await expect(resolvers?.promise).resolves.toBe(42)
	})
})

function readWithResolvers() {
	const constructor: CompatiblePromiseConstructor = Promise
	return constructor.withResolvers
}

function readAbortSignalAny() {
	const constructor: CompatibleAbortSignalConstructor = AbortSignal
	return constructor.any
}
