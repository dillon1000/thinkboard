import { readProperty } from '@agentboard/shared'
import { isFunction } from '@agentboard/shared'
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
	return isFunction(readProperty(Promise, 'withResolvers')) &&
		isFunction(readProperty(AbortSignal, 'any'))
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
