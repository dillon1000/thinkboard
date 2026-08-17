import modernPDFWorkerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import legacyPDFWorkerURL from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { ensurePDFCompatibility } from './pdfCompatibility'

type PDFJS = typeof import('pdfjs-dist')

let runtimePromise: Promise<PDFJS> | null = null

export function loadPDFJS() {
	runtimePromise ??= supportsModernPDFJS()
		? import('pdfjs-dist').then((pdfjs) => configurePDFJS(pdfjs, modernPDFWorkerURL))
		: loadLegacyPDFJS()
	return runtimePromise
}

export function supportsModernPDFJS() {
	return typeof Reflect.get(Promise, 'withResolvers') === 'function' &&
		typeof Reflect.get(AbortSignal, 'any') === 'function'
}

function loadLegacyPDFJS() {
	ensurePDFCompatibility()
	return import('pdfjs-dist/legacy/build/pdf.mjs')
		.then((pdfjs) => configurePDFJS(pdfjs, legacyPDFWorkerURL))
}

function configurePDFJS(pdfjs: PDFJS, workerURL: string) {
	pdfjs.GlobalWorkerOptions.workerSrc = workerURL
	return pdfjs
}
