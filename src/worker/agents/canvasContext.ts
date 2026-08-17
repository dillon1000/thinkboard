import type {
	CanvasContext,
	CanvasShape,
	CanvasShapeRelationship,
} from '@agentboard/shared'
import type { ModelMessage } from 'ai'

const MAX_CANVAS_CONTEXT_TEXT_LENGTH = 430_000
const MAX_SELECTED_PDF_TEXT_LENGTH = 400_000
const SELECTION_IMAGE_INSTRUCTION =
	'The next image is the CURRENT canvas selection for the latest user request. Prefer it over images from earlier conversation turns. Read visible handwriting, math, labels, and diagrams directly. If a detail is genuinely illegible, identify that detail precisely rather than treating the whole selection as unknown.'
const SELECTED_WORK_INSTRUCTION =
	'The student selected canvas work for this request. Treat that selection as the referent of words such as “this,” “these,” “selected,” or “highlighted.” Complete the request from the provided space context now. Do not say the message is empty, and do not ask the student to upload or retype legible selected content.'
const VIEWPORT_CONTEXT_INSTRUCTION =
	'The current canvas context describes the space version and what the student can see. Use visible and related shapes to interpret spatial references and diagram structure.'

export function attachCanvasContext(
	messages: ModelMessage[],
	canvasContext: CanvasContext | undefined
): ModelMessage[] {
	if (!canvasContext) return messages
	const hasSelection = Boolean(
		canvasContext.selection.length ||
		canvasContext.documentText?.length
	)
	const image = canvasContext?.selectionImage

	const userMessageIndex = messages.findLastIndex((message) => message.role === 'user')
	if (userMessageIndex < 0) return messages

	const focusedMessages = hasSelection
		? removeHistoricalImages(messages, userMessageIndex)
		: messages
	const userMessage = focusedMessages[userMessageIndex]
	if (userMessage?.role !== 'user') return messages
	const content = Array.isArray(userMessage.content)
		? userMessage.content
		: [{ type: 'text' as const, text: userMessage.content }]
	const canvasContextText = formatCanvasContextForModel(canvasContext)

	const nextMessages = [...focusedMessages]
	nextMessages[userMessageIndex] = {
		...userMessage,
		content: [
			...content,
			{
				type: 'text' as const,
				text: hasSelection ? SELECTED_WORK_INSTRUCTION : VIEWPORT_CONTEXT_INSTRUCTION,
			},
			...(canvasContextText ? [{
				type: 'text' as const,
				text: `Current canvas structure:\n<canvas-structure>\n${canvasContextText}\n</canvas-structure>`,
			}] : []),
			...(image ? [
				{ type: 'text' as const, text: SELECTION_IMAGE_INSTRUCTION },
				{ type: 'file' as const, data: image.data, mediaType: image.mediaType },
			] : []),
		],
	}
	return nextMessages
}

function removeHistoricalImages(messages: ModelMessage[], currentUserMessageIndex: number) {
	return messages.map((message, messageIndex) => {
		if (
			message.role !== 'user' ||
			messageIndex === currentUserMessageIndex ||
			!Array.isArray(message.content)
		) return message

		return {
			...message,
			content: message.content.filter(
				(part) => part.type !== 'file' || !part.mediaType.startsWith('image/')
			),
		}
	})
}

export function formatCanvasContextForModel(canvasContext: CanvasContext) {
	const lines = [
		`Space: ${canvasContext.boardID}`,
		...(canvasContext.anchor
			? [`Anchor point: x=${formatNumber(canvasContext.anchor.x)}, y=${formatNumber(canvasContext.anchor.y)}`]
			: []),
		...(canvasContext.pageID ? [`Page: ${canvasContext.pageID}`] : []),
		...(canvasContext.documentClock !== undefined
			? [`Document clock: ${canvasContext.documentClock}`]
			: []),
	]

	if (canvasContext.viewport) {
		const { x, y, w, h, zoom, shapes } = canvasContext.viewport
		lines.push(
			'',
			`Viewport: x=${formatNumber(x)}, y=${formatNumber(y)}, w=${formatNumber(w)}, h=${formatNumber(h)}, zoom=${formatNumber(zoom)}`,
			'Visible shapes:',
			...(shapes.length ? shapes.map(formatShape) : ['- none'])
		)
	}

	lines.push(
		'',
		'Selected shapes:',
		...(canvasContext.selection.length
			? canvasContext.selection.map(formatShape)
			: ['- none'])
	)

	if (canvasContext.relatedShapes.length) {
		lines.push('', 'Directly related shapes:', ...canvasContext.relatedShapes.map(formatShape))
	}

	if (canvasContext.relationships.length) {
		const shapeByID = new Map(
			[
				...canvasContext.selection,
				...(canvasContext.viewport?.shapes ?? []),
				...canvasContext.relatedShapes,
			].map((shape) => [shape.id, shape])
		)
		lines.push(
			'',
			'Shape relationships:',
			...formatRelationships(canvasContext.relationships, shapeByID)
		)
	}

	if (canvasContext.documentText?.length) {
		lines.push(
			'',
			'Selected PDF text:',
			...formatSelectedPDFText(canvasContext.documentText)
		)
	}

	return lines.join('\n').slice(0, MAX_CANVAS_CONTEXT_TEXT_LENGTH)
}

function formatSelectedPDFText(pages: NonNullable<CanvasContext['documentText']>) {
	const completeEntries = pages.map((page) =>
		`- ${page.documentTitle}, page ${page.pageNumber} (${page.documentID})\n  ${page.text.replace(/\n/g, '\n  ')}`
	)
	if (completeEntries.join('\n').length <= MAX_SELECTED_PDF_TEXT_LENGTH) {
		return completeEntries
	}

	const entries: string[] = []
	let remainingCharacters = MAX_SELECTED_PDF_TEXT_LENGTH
	for (const [index, page] of pages.entries()) {
		const remainingPages = pages.length - index
		const pageBudget = Math.floor(remainingCharacters / remainingPages)
		const header = `- ${page.documentTitle}, page ${page.pageNumber} (${page.documentID})`
		const text = page.text.replace(/\n/g, '\n  ')
		const textBudget = Math.max(0, pageBudget - header.length - 3)
		const clippedText = text.length > textBudget
			? `${text.slice(0, Math.max(0, textBudget - 1))}…`
			: text
		const entry = clippedText ? `${header}\n  ${clippedText}` : header
		entries.push(entry)
		remainingCharacters = Math.max(0, remainingCharacters - entry.length - 1)
	}
	return entries
}

function formatRelationships(
	relationships: readonly CanvasShapeRelationship[],
	shapeByID: ReadonlyMap<string, CanvasShape>
) {
	const arrowBindingsByConnector = new Map<string, CanvasShapeRelationship[]>()
	for (const relationship of relationships) {
		if (relationship.type !== 'arrow') continue
		const current = arrowBindingsByConnector.get(relationship.connectorShapeID) ?? []
		current.push(relationship)
		arrowBindingsByConnector.set(relationship.connectorShapeID, current)
	}

	const groupedBindingIDs = new Set<string>()
	const lines: string[] = []
	for (const [connectorShapeID, bindings] of arrowBindingsByConnector) {
		const start = bindings.find(({ terminal }) => terminal === 'start')
		const end = bindings.find(({ terminal }) => terminal === 'end')
		if (!start || !end) continue
		groupedBindingIDs.add(start.bindingID)
		groupedBindingIDs.add(end.bindingID)
		lines.push(
			`- arrow ${formatShapeReference(shapeByID.get(connectorShapeID), connectorShapeID)} connects ${formatShapeReference(shapeByID.get(start.targetShapeID), start.targetShapeID)} -> ${formatShapeReference(shapeByID.get(end.targetShapeID), end.targetShapeID)}`
		)
	}

	for (const relationship of relationships) {
		if (groupedBindingIDs.has(relationship.bindingID)) continue
		const connector = formatShapeReference(
			shapeByID.get(relationship.connectorShapeID),
			relationship.connectorShapeID
		)
		const target = formatShapeReference(
			shapeByID.get(relationship.targetShapeID),
			relationship.targetShapeID
		)
		const terminal = relationship.terminal ? ` ${relationship.terminal}` : ''
		const anchor = relationship.anchor
			? ` at normalized anchor (${formatNumber(relationship.anchor.x)}, ${formatNumber(relationship.anchor.y)})`
			: ''
		lines.push(
			`- ${relationship.type} binding ${relationship.bindingID}: ${connector}${terminal} -> ${target}${anchor}`
		)
	}

	return lines
}

function formatShape(shape: CanvasShape) {
	const parent = shape.parentShapeID ? `, parent=${shape.parentShapeID}` : ''
	const children = shape.childShapeIDs?.length ? `, children=${shape.childShapeIDs.join('|')}` : ''
	const layer = shape.index ? `, layer=${shape.index}` : ''
	const locked = shape.isLocked ? ', locked=true' : ''
	const opacity = shape.opacity === undefined || shape.opacity === 1
		? ''
		: `, opacity=${formatNumber(shape.opacity)}`
	const style = shape.style
		? `, style=${Object.entries(shape.style).map(([key, value]) => `${key}:${value}`).join('|')}`
		: ''
	const geometry = `x=${formatNumber(shape.x)}, y=${formatNumber(shape.y)}, w=${formatNumber(shape.w)}, h=${formatNumber(shape.h)}, rotation=${formatNumber(shape.rotation)}${layer}${locked}${opacity}${style}`
	const text = shape.text?.plainText.trim()
	const html = shape.text?.html?.trim()
	return [
		`- ${shape.id} [${shape.type}${parent}${children}] (${geometry})`,
		...(text ? [`  text: ${text.replace(/\n/g, '\n  ')}`] : []),
		...(html ? [`  rich text (HTML): ${html}`] : []),
	].join('\n')
}

function formatShapeReference(shape: CanvasShape | undefined, fallbackID: string) {
	if (!shape) return fallbackID
	const text = shape.text?.plainText.trim().replace(/\s+/g, ' ').slice(0, 80)
	return `${shape.id} [${shape.type}]${text ? ` “${text}”` : ''}`
}

function formatNumber(value: number) {
	return Number(value.toFixed(2))
}
