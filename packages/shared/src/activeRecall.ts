import { z } from 'zod'
import { canvasContextSchema } from './canvasContext'

export const activeRecallModeSchema = z.enum(['handwriting-check', 'teach-back'])
export const activeRecallVerdictSchema = z.enum(['correct', 'partial', 'incorrect', 'unclear'])
export const activeRecallStepStatusSchema = z.enum(['correct', 'incorrect', 'unclear'])

export const activeRecallRegionSchema = z.object({
	h: z.number().min(0.02).max(1),
	w: z.number().min(0.02).max(1),
	x: z.number().min(0).max(1),
	y: z.number().min(0).max(1),
}).refine(({ h, w, x, y }) => x + w <= 1.01 && y + h <= 1.01, {
	message: 'The feedback region must fit inside the selected image',
})

export const activeRecallGradeRequestSchema = z.object({
	canvasContext: canvasContextSchema,
	explanation: z.string().trim().max(12_000).default(''),
	mode: activeRecallModeSchema,
	sourceText: z.string().trim().max(24_000).default(''),
	topic: z.string().trim().max(300).default(''),
}).superRefine((value, context) => {
	if (value.mode === 'handwriting-check' && !value.canvasContext.selectionImage) {
		context.addIssue({
			code: 'custom',
			message: 'Select visible handwritten work first',
			path: ['canvasContext', 'selectionImage'],
		})
	}
	if (
		value.mode === 'teach-back' &&
		!value.explanation &&
		!value.canvasContext.selectionImage
	) {
		context.addIssue({
			code: 'custom',
			message: 'Enter or select an explanation first',
			path: ['explanation'],
		})
	}
})

export const activeRecallGradeResponseSchema = z.object({
	nextStep: z.string().trim().min(1).max(500),
	score: z.number().int().min(0).max(100),
	steps: z.array(z.object({
		feedback: z.string().trim().min(1).max(500),
		label: z.string().trim().min(1).max(180),
		region: activeRecallRegionSchema.nullable(),
		status: activeRecallStepStatusSchema,
	})).min(1).max(12),
	strengths: z.array(z.string().trim().min(1).max(300)).max(4),
	summary: z.string().trim().min(1).max(700),
	verdict: activeRecallVerdictSchema,
})

export type ActiveRecallGradeRequest = z.infer<typeof activeRecallGradeRequestSchema>
export type ActiveRecallGradeResponse = z.infer<typeof activeRecallGradeResponseSchema>
export type ActiveRecallRegion = z.infer<typeof activeRecallRegionSchema>
export type ActiveRecallVerdict = z.infer<typeof activeRecallVerdictSchema>
