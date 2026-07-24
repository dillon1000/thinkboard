import type { ModelMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import { attachCanvasContext, formatCanvasContextForModel } from './canvasContext'

describe('attachCanvasContext', () => {
	it('adds a rendered selection to the latest user message', () => {
		const messages: ModelMessage[] = [
			{ role: 'user', content: 'What did I get wrong?' },
			{ role: 'assistant', content: 'Select the work you want reviewed.' },
			{ role: 'user', content: 'Check this.' },
		]

		const result = attachCanvasContext(messages, {
			boardID: 'board-1',
			documentClock: 42,
			relatedShapes: [],
			relationships: [],
			selection: [{ h: 20, id: 'shape-1', rotation: 0, text: { plainText: 'x = 2' }, type: 'text', w: 40, x: 10, y: 10 }],
			selectionImage: {
				data: 'aGVsbG8=',
				height: 240,
				mediaType: 'image/jpeg',
				width: 320,
			},
		})

		expect(result).not.toBe(messages)
		expect(result[2]).toMatchObject({
			role: 'user',
			content: expect.arrayContaining([
				{ type: 'text', text: 'Check this.' },
				{ type: 'file', data: 'aGVsbG8=', mediaType: 'image/jpeg' },
			]),
		})
		expect(messages[2]).toEqual({ role: 'user', content: 'Check this.' })
	})

	it('reinforces selected text context when no image is available', () => {
		const messages: ModelMessage[] = [{ role: 'user', content: 'Explain this.' }]

		const result = attachCanvasContext(messages, {
			boardID: 'board-1',
			relatedShapes: [],
			relationships: [],
			selection: [{ h: 20, id: 'shape-1', rotation: 0, text: { plainText: 'Supply and demand' }, type: 'text', w: 80, x: 0, y: 0 }],
		})

		expect(result[0]).toMatchObject({
			role: 'user',
			content: expect.arrayContaining([
				{ type: 'text', text: expect.stringContaining('Do not say the message is empty') },
				{ type: 'text', text: expect.stringContaining('Supply and demand') },
			]),
		})
	})

	it('removes historical images when a current canvas selection is attached', () => {
		const messages: ModelMessage[] = [
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'What is in my uploaded image?' },
					{ type: 'file', data: 'b2xkLWltYWdl', mediaType: 'image/jpeg' },
				],
			},
			{ role: 'assistant', content: 'It contains amino acid structures.' },
			{ role: 'user', content: 'Solve the highlighted problem.' },
		]

		const result = attachCanvasContext(messages, {
			boardID: 'board-1',
			relatedShapes: [],
			relationships: [],
			selection: [{ h: 20, id: 'shape-1', rotation: 0, text: { plainText: 'What is 9+9?' }, type: 'text', w: 80, x: 0, y: 0 }],
			selectionImage: {
				data: 'bmV3LWltYWdl',
				height: 100,
				mediaType: 'image/jpeg',
				width: 200,
			},
		})

		expect(result[0]).toEqual({
			role: 'user',
			content: [{ type: 'text', text: 'What is in my uploaded image?' }],
		})
		expect(result[2]).toMatchObject({
			role: 'user',
			content: expect.arrayContaining([
				{ type: 'text', text: expect.stringContaining('What is 9+9?') },
				{ type: 'file', data: 'bmV3LWltYWdl', mediaType: 'image/jpeg' },
			]),
		})
	})

	it('attaches viewport context when nothing is selected', () => {
		const messages: ModelMessage[] = [{ role: 'user', content: 'Explain supply and demand.' }]

		const result = attachCanvasContext(messages, {
			boardID: 'board-1',
			documentClock: 9,
			relatedShapes: [],
			relationships: [],
			selection: [],
			viewport: { h: 600, shapes: [], w: 800, x: 0, y: 0, zoom: 1 },
		})

		expect(result[0]).toMatchObject({
			role: 'user',
			content: expect.arrayContaining([
				{ type: 'text', text: expect.stringContaining('Document clock: 9') },
				{ type: 'text', text: expect.stringContaining('what the student can see') },
			]),
		})
	})

	it('treats selected PDF text as the primary referent', () => {
		const result = attachCanvasContext(
			[{ role: 'user', content: 'Explain this.' }],
			{
				boardID: 'board-1',
				documentText: [{
					documentID: 'document-1',
					documentTitle: 'Biology reader',
					pageNumber: 12,
					text: 'Mitosis produces two genetically identical daughter cells.',
				}],
				relatedShapes: [],
				relationships: [],
				selection: [],
			}
		)

		expect(result[0]).toMatchObject({
			role: 'user',
			content: expect.arrayContaining([
				{ type: 'text', text: expect.stringContaining('as the referent') },
				{ type: 'text', text: expect.stringContaining('genetically identical') },
			]),
		})
	})

	it('formats rich text and arrow bindings as semantic structure', () => {
		const formatted = formatCanvasContextForModel({
			boardID: 'board-1',
			documentClock: 17,
			pageID: 'page:one',
			selection: [{
				h: 40,
				id: 'shape:claim',
				rotation: 0,
				text: { plainText: 'Main claim', html: '<p><strong>Main</strong> claim</p>' },
				type: 'text',
				w: 120,
				x: 10,
				y: 20,
			}],
			relatedShapes: [{
				h: 40,
				id: 'shape:evidence',
				rotation: 0,
				text: { plainText: 'Evidence' },
				type: 'note',
				w: 120,
				x: 200,
				y: 20,
			}],
			relationships: [{
				anchor: { x: 0.5, y: 0.5 },
				bindingID: 'binding:start',
				connectorShapeID: 'shape:arrow',
				targetShapeID: 'shape:claim',
				terminal: 'start',
				type: 'arrow',
			}, {
				anchor: { x: 0.5, y: 0.5 },
				bindingID: 'binding:end',
				connectorShapeID: 'shape:arrow',
				targetShapeID: 'shape:evidence',
				terminal: 'end',
				type: 'arrow',
			}],
			viewport: { h: 500, shapes: [], w: 900, x: 0, y: 0, zoom: 1.25 },
		})

		expect(formatted).toContain('Document clock: 17')
		expect(formatted).toContain('rich text (HTML): <p><strong>Main</strong> claim</p>')
		expect(formatted).toContain('shape:claim [text] “Main claim” -> shape:evidence [note] “Evidence”')
		expect(formatted).not.toContain('Selection 1')
	})

	it('formats layer, lock, containment, and style metadata', () => {
		const formatted = formatCanvasContextForModel({
			boardID: 'board-1',
			selection: [{
				id: 'shape:frame',
				type: 'frame',
				childShapeIDs: ['shape:child'],
				index: 'a4',
				isLocked: true,
				opacity: 0.75,
				x: 0,
				y: 0,
				w: 400,
				h: 300,
				rotation: 0,
				style: { color: 'agent-blue' },
			}],
			relatedShapes: [],
			relationships: [],
		})

		expect(formatted).toContain('children=shape:child')
		expect(formatted).toContain('layer=a4')
		expect(formatted).toContain('locked=true')
		expect(formatted).toContain('style=color:agent-blue')
	})

	it('includes authorized PDF text beside the current selection', () => {
		const formatted = formatCanvasContextForModel({
			boardID: 'board-1',
			documentText: [{
				documentID: 'document-1',
				documentTitle: 'Biology reader',
				pageNumber: 12,
				text: 'Mitosis produces two genetically identical daughter cells.',
			}],
			relatedShapes: [],
			relationships: [],
			selection: [],
		})

		expect(formatted).toContain('Selected PDF text')
		expect(formatted).toContain('Biology reader, page 12')
		expect(formatted).toContain('genetically identical')
	})

	it('represents every page from a selected PDF frame within the context budget', () => {
		const formatted = formatCanvasContextForModel({
			boardID: 'board-1',
			documentText: Array.from({ length: 200 }, (_, index) => ({
				documentID: 'document-1',
				documentTitle: 'Biology reader',
				pageNumber: index + 1,
				text: `Page ${index + 1} content. ${'Detailed course material. '.repeat(300)}`,
			})),
			relatedShapes: [],
			relationships: [],
			selection: [],
		})

		expect(formatted).toContain('Biology reader, page 1')
		expect(formatted).toContain('Biology reader, page 200')
		expect(formatted).toContain('Page 200 content.')
	})

	it('reports the anchor point of an inline request', () => {
		const formatted = formatCanvasContextForModel({
			anchor: { x: 128.456, y: -64.5 },
			boardID: 'board-1',
			relatedShapes: [],
			relationships: [],
			selection: [],
		})

		expect(formatted).toContain('Anchor point: x=128.46, y=-64.5')
	})

	it('omits the anchor line for panel requests', () => {
		const formatted = formatCanvasContextForModel({
			boardID: 'board-1',
			relatedShapes: [],
			relationships: [],
			selection: [],
		})

		expect(formatted).not.toContain('Anchor point')
	})
})
