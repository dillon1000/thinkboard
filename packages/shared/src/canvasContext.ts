import { z } from 'zod'

export const MAX_CANVAS_SELECTION_IMAGE_DATA_LENGTH = 3_000_000

export const canvasSelectionImageSchema = z.object({
	data: z.string().min(1).max(MAX_CANVAS_SELECTION_IMAGE_DATA_LENGTH),
	height: z.number().int().positive().max(2_048),
	mediaType: z.literal('image/jpeg'),
	width: z.number().int().positive().max(2_048),
})

export const canvasShapeTextSchema = z.object({
	plainText: z.string().max(2_000),
	html: z.string().max(4_000).optional(),
})

export const canvasShapeSchema = z.object({
	id: z.string().max(120),
	type: z.string().max(80),
	parentShapeID: z.string().max(120).optional(),
	x: z.number(),
	y: z.number(),
	w: z.number().nonnegative(),
	h: z.number().nonnegative(),
	rotation: z.number(),
	text: canvasShapeTextSchema.optional(),
})

export const canvasShapeRelationshipSchema = z.object({
	bindingID: z.string().max(120),
	type: z.string().max(80),
	connectorShapeID: z.string().max(120),
	targetShapeID: z.string().max(120),
	terminal: z.enum(['start', 'end']).optional(),
	anchor: z.object({ x: z.number(), y: z.number() }).optional(),
})

export const canvasPDFPageRegionSchema = z.object({
	documentID: z.string().max(120),
	pageNumber: z.number().int().positive().max(200),
	region: z.object({
		h: z.number().min(0).max(1),
		w: z.number().min(0).max(1),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
	}),
	shapeID: z.string().max(120),
})

export const canvasDocumentTextSchema = z.object({
	documentID: z.string().max(120),
	documentTitle: z.string().max(180),
	pageNumber: z.number().int().positive().max(200),
	text: z.string().max(8_000),
})

export const canvasContextSchema = z.object({
	boardID: z.string().max(100),
	pageID: z.string().max(100).optional(),
	documentClock: z.number().int().nonnegative().optional(),
	viewport: z
		.object({
			x: z.number(),
			y: z.number(),
			w: z.number().nonnegative(),
			h: z.number().nonnegative(),
			zoom: z.number().positive(),
			shapes: z.array(canvasShapeSchema).max(40),
		})
		.optional(),
	selection: z.array(canvasShapeSchema).max(30),
	relatedShapes: z.array(canvasShapeSchema).max(30).default([]),
	relationships: z.array(canvasShapeRelationshipSchema).max(60).default([]),
	selectionImage: canvasSelectionImageSchema.optional(),
	pdfPageRegions: z.array(canvasPDFPageRegionSchema).max(10).optional(),
	documentText: z.array(canvasDocumentTextSchema).max(10).optional(),
})

export type CanvasContext = z.infer<typeof canvasContextSchema>
export type CanvasShape = z.infer<typeof canvasShapeSchema>
export type CanvasShapeRelationship = z.infer<typeof canvasShapeRelationshipSchema>
export type CanvasShapeText = z.infer<typeof canvasShapeTextSchema>
export type CanvasSelectionImage = z.infer<typeof canvasSelectionImageSchema>
export type CanvasPDFPageRegion = z.infer<typeof canvasPDFPageRegionSchema>
export type CanvasDocumentText = z.infer<typeof canvasDocumentTextSchema>
