import type { DocumentSummary } from '@agentboard/shared'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { Editor } from 'tldraw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	canvasToBlob,
	findMatchingPDFDocument,
	getPDFRenderScale,
	hasCompletePDFPageShapeSet,
	placePDFPages,
	readPDFTextItems,
	yieldToBrowser,
} from './pdfImport'

type PDFTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('readPDFTextItems', () => {
	it('reads text without requiring ReadableStream async iteration', async () => {
		const textItem: PDFTextContent['items'][number] = {
			dir: 'ltr',
			fontName: 'font-1',
			hasEOL: false,
			height: 10,
			str: 'Mobile PDF text',
			transform: [1, 0, 0, 1, 20, 30],
			width: 80,
		}
		const stream = new ReadableStream<PDFTextContent>({
			start(controller) {
				controller.enqueue({
					items: [textItem],
					lang: null,
					styles: {},
				})
				controller.close()
			},
		})
		Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined })

		await expect(readPDFTextItems({
			streamTextContent: () => stream,
		})).resolves.toEqual([textItem])
	})
})

describe('canvasToBlob', () => {
	it('encodes page images as WebP by default', async () => {
		const toBlob = vi.fn((
			callback: BlobCallback,
			type?: string,
			_quality?: number
		) => callback(new Blob(['page'], { type })))
		const canvas = { toBlob } as unknown as HTMLCanvasElement

		const image = await canvasToBlob(canvas)

		expect(image.type).toBe('image/webp')
		expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.88)
	})
})

describe('yieldToBrowser', () => {
	it('uses the browser scheduling API when it is available', async () => {
		const yieldExecution = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal('scheduler', { yield: yieldExecution })

		await yieldToBrowser()

		expect(yieldExecution).toHaveBeenCalledOnce()
	})
})

describe('getPDFRenderScale', () => {
	it('renders standard pages at four times density on high-density displays', () => {
		expect(getPDFRenderScale(612, 792, 2)).toBe(4)
	})

	it('keeps standard pages above the previous two-times density on regular displays', () => {
		expect(getPDFRenderScale(612, 792, 1)).toBe(3)
	})

	it('caps unusually large pages by pixel count and canvas dimensions', () => {
		const scale = getPDFRenderScale(2_000, 3_000, 3)

		expect(scale).toBeLessThan(2)
		expect(2_000 * scale).toBeLessThanOrEqual(4_096)
		expect(2_000 * scale * 3_000 * scale).toBeLessThanOrEqual(9_000_000)
	})
})

describe('placePDFPages', () => {
	it('selects and focuses the first imported page', () => {
		const createShapes = vi.fn()
		const setSelectedShapes = vi.fn()
		const zoomToSelection = vi.fn()
		const editor = {
			createShape: vi.fn(),
			createShapes,
			deleteShapes: vi.fn(),
			getCurrentPageShapesSorted: () => [],
			getPageShapeIds: () => new Set(),
			getPages: () => [],
			getViewportPageBounds: () => ({ h: 800, w: 1_200, x: 0, y: 0 }),
			markHistoryStoppingPoint: vi.fn(),
			run: (callback: () => void) => callback(),
			setSelectedShapes,
			zoomToSelection,
		} as unknown as Editor
		const document = {
			id: 'document-1',
			title: 'Large notes.pdf',
		} as DocumentSummary

		placePDFPages(editor, document, [
			{ height: 792, pageNumber: 1, width: 612 },
			{ height: 792, pageNumber: 2, width: 612 },
		])

		const createdPages = createShapes.mock.calls[0]?.[0] as Array<{ id: string }>
		expect(setSelectedShapes).toHaveBeenCalledWith([createdPages[0]?.id])
		expect(zoomToSelection).toHaveBeenCalledWith({ animation: { duration: 300 } })
	})
})

describe('findMatchingPDFDocument', () => {
	it('finds an existing import that can be rendered again in place', () => {
		const document = {
			byteSize: 42_000,
			pageCount: 18,
			title: 'notes.pdf',
		} as Parameters<typeof findMatchingPDFDocument>[0][number]

		expect(findMatchingPDFDocument(
			[document],
			{ name: 'notes.pdf', size: 42_000 },
			18
		)).toBe(document)
	})

	it('does not match a different file with the same name', () => {
		const document = {
			byteSize: 42_000,
			pageCount: 18,
			title: 'notes.pdf',
		} as Parameters<typeof findMatchingPDFDocument>[0][number]

		expect(findMatchingPDFDocument(
			[document],
			{ name: 'notes.pdf', size: 43_000 },
			18
		)).toBeNull()
	})
})

describe('hasCompletePDFPageShapeSet', () => {
	it('requires an existing canvas shape for every PDF page', () => {
		expect(hasCompletePDFPageShapeSet(
			[{ props: { pageNumber: 1 } }],
			[
				{ pageNumber: 1 },
				{ pageNumber: 2 },
				{ pageNumber: 3 },
			]
		)).toBe(false)
	})

	it('accepts a complete set regardless of shape order', () => {
		expect(hasCompletePDFPageShapeSet(
			[
				{ props: { pageNumber: 3 } },
				{ props: { pageNumber: 1 } },
				{ props: { pageNumber: 2 } },
			],
			[
				{ pageNumber: 1 },
				{ pageNumber: 2 },
				{ pageNumber: 3 },
			]
		)).toBe(true)
	})

	it('rejects duplicate shapes when a page is missing', () => {
		expect(hasCompletePDFPageShapeSet(
			[
				{ props: { pageNumber: 1 } },
				{ props: { pageNumber: 1 } },
				{ props: { pageNumber: 3 } },
			],
			[
				{ pageNumber: 1 },
				{ pageNumber: 2 },
				{ pageNumber: 3 },
			]
		)).toBe(false)
	})
})
