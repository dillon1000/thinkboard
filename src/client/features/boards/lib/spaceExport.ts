import { isString } from '@agentboard/shared'
import { FLASHCARD_SHAPE_TYPE } from '@agentboard/shared'
import type { Editor } from 'tldraw'

const PDF_PORTRAIT_SIZE = [595.28, 841.89] as const
const PDF_MARGIN = 24

export interface ExportFlashcard {
	alternateAnswers: string[]
	back: string
	front: string
	pageName: string
}

/**
 * Renders each non-empty canvas page into one standard PDF page.
 * The export runs in the browser and does not upload a second copy of the space.
 */
export async function exportSpacePDF(editor: Editor, title: string) {
	const { PDFDocument } = await import('pdf-lib')
	const document = await PDFDocument.create()
	document.setCreator('Thinkspace')
	document.setProducer('Thinkspace')
	document.setTitle(title)

	for (const page of editor.getPages()) {
		const shapeIDs = [...editor.getPageShapeIds(page)]
		if (!shapeIDs.length) continue
		const image = await editor.toImage(shapeIDs, {
			background: true,
			darkMode: false,
			format: 'png',
			padding: 32,
			pixelRatio: 1,
		})
		const embedded = await document.embedPng(await image.blob.arrayBuffer())
		const isLandscape = image.width > image.height
		const pageWidth = isLandscape ? PDF_PORTRAIT_SIZE[1] : PDF_PORTRAIT_SIZE[0]
		const pageHeight = isLandscape ? PDF_PORTRAIT_SIZE[0] : PDF_PORTRAIT_SIZE[1]
		const scale = Math.min(
			(pageWidth - PDF_MARGIN * 2) / image.width,
			(pageHeight - PDF_MARGIN * 2) / image.height
		)
		const width = image.width * scale
		const height = image.height * scale
		document.addPage([pageWidth, pageHeight]).drawImage(embedded, {
			height,
			width,
			x: (pageWidth - width) / 2,
			y: (pageHeight - height) / 2,
		})
	}

	if (!document.getPageCount()) throw new Error('This space has no canvas content to export')
	const bytes = await document.save({ useObjectStreams: true })
	downloadBlob(
		new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
		`${safeExportFileName(title)}.pdf`
	)
}

export function collectSpaceFlashcards(editor: Editor): ExportFlashcard[] {
	const cards: ExportFlashcard[] = []
	for (const page of editor.getPages()) {
		for (const shapeID of editor.getPageShapeIds(page)) {
			const shape = editor.getShape(shapeID)
			if (shape?.type !== FLASHCARD_SHAPE_TYPE) continue
			const front = Reflect.get(shape.props, 'front')
			const back = Reflect.get(shape.props, 'back')
			const alternateAnswers = Reflect.get(shape.props, 'alternateAnswers')
			if (!isString(front) || !isString(back)) continue
			cards.push({
				alternateAnswers: Array.isArray(alternateAnswers)
					? alternateAnswers.filter((answer): answer is string => isString(answer))
					: [],
				back,
				front,
				pageName: page.name,
			})
		}
	}
	return cards
}

export function createFlashcardCSV(cards: readonly ExportFlashcard[], title: string) {
	const rows = cards.map((card) => [
		card.front,
		card.back,
		card.alternateAnswers.join(' | '),
		createCardTags(title, card.pageName),
	])
	return [
		['Front', 'Back', 'Alternate Answers', 'Tags'],
		...rows,
	].map((row) => row.map(escapeCSVField).join(',')).join('\r\n')
}

/**
 * Creates a UTF-8 tab file with Anki headers. HTML mode preserves line breaks,
 * and the third column is mapped to note tags during import.
 */
export function createFlashcardAnkiText(
	cards: readonly ExportFlashcard[],
	title: string
) {
	const deck = title.replace(/[\r\n]+/g, ' ').trim().slice(0, 180) || 'Thinkspace'
	const rows = cards.map((card) => {
		const alternatives = card.alternateAnswers.length
			? `<br><br><small>Also accept: ${card.alternateAnswers.map(escapeAnkiHTML).join('; ')}</small>`
			: ''
		return [
			escapeAnkiHTML(card.front),
			`${escapeAnkiHTML(card.back)}${alternatives}`,
			createCardTags(title, card.pageName),
		].join('\t')
	})
	return [
		'#separator:Tab',
		'#html:true',
		`#deck:${deck}`,
		'#columns:Front\tBack\tTags',
		'#tags column:3',
		...rows,
	].join('\n')
}

export function downloadFlashcardCSV(cards: readonly ExportFlashcard[], title: string) {
	if (!cards.length) throw new Error('This space has no flashcards to export')
	downloadBlob(
		new Blob([`\uFEFF${createFlashcardCSV(cards, title)}`], {
			type: 'text/csv;charset=utf-8',
		}),
		`${safeExportFileName(title)}-flashcards.csv`
	)
}

export function downloadFlashcardAnkiText(
	cards: readonly ExportFlashcard[],
	title: string
) {
	if (!cards.length) throw new Error('This space has no flashcards to export')
	downloadBlob(
		new Blob([createFlashcardAnkiText(cards, title)], {
			type: 'text/plain;charset=utf-8',
		}),
		`${safeExportFileName(title)}-anki.txt`
	)
}

export function safeExportFileName(value: string) {
	return value
		.normalize('NFKC')
		.replace(/[^\p{Letter}\p{Number}._-]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120) || 'thinkspace'
}

function escapeCSVField(value: string) {
	return `"${value.replaceAll('"', '""')}"`
}

function escapeAnkiHTML(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
		.replaceAll('\t', '    ')
		.replace(/\r?\n/g, '<br>')
}

function createCardTags(title: string, pageName: string) {
	return [
		'thinkspace',
		`thinkspace::${safeTag(title)}`,
		...(pageName ? [`page::${safeTag(pageName)}`] : []),
	].join(' ')
}

function safeTag(value: string) {
	return value
		.normalize('NFKC')
		.replace(/[^\p{Letter}\p{Number}_-]+/gu, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 100) || 'untitled'
}

function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.download = fileName
	link.href = url
	document.body.appendChild(link)
	link.click()
	link.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
