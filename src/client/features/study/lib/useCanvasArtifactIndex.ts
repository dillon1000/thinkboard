import {
	CONCEPT_MAP_SHAPE_TYPE,
	FLASHCARD_SHAPE_TYPE,
	MATH_SHAPE_TYPE,
	QUIZ_SHAPE_TYPE,
	REVIEW_SHAPE_TYPE,
	TEACH_BACK_SHAPE_TYPE,
	WALKTHROUGH_SHAPE_TYPE,
	apiRoutes,
	type StudyArtifactInput,
	type StudyArtifactKind,
} from '@agentboard/shared'
import { useEffect } from 'react'
import { z } from 'zod'
import type { Editor, TLShape } from 'tldraw'
import { apiRequest } from '../../../lib/api'

const INDEX_DELAY_MS = 1_500
const MAX_INDEXED_SHAPES = 100
const INDEXED_KINDS = [
	'concept-map',
	'equation',
	'flashcard',
	'note',
	'quiz',
	'review-note',
	'teach-back',
	'walkthrough',
] as const satisfies readonly StudyArtifactKind[]
const artifactPropsSchema = z.looseObject({
	alternateAnswers: z.array(z.string()).optional(),
	back: z.string().optional(),
	correctIndex: z.number().optional(),
	explanation: z.string().optional(),
	front: z.string().optional(),
	options: z.array(z.string()).optional(),
	question: z.string().optional(),
	title: z.string().optional(),
	topic: z.string().optional(),
})

interface ArtifactIndexRequest {
	artifacts: StudyArtifactInput[]
	replaceKinds?: readonly StudyArtifactKind[]
}

/**
 * Mirrors text-bearing canvas shapes into the search index after edits settle. The Worker replaces
 * a full snapshot only when the canvas fits within the request limit, so a large board cannot lose
 * older index entries because the client truncated its upload.
 */
export function useCanvasArtifactIndex(
	editor: Editor | null,
	boardID: string,
	enabled: boolean
) {
	useEffect(() => {
		if (!editor || !enabled) return
		let timer: number | undefined
		let stopped = false

		const schedule = () => {
			if (timer) window.clearTimeout(timer)
			timer = window.setTimeout(() => {
				timer = undefined
				const snapshot = collectCanvasArtifacts(editor)
				const body: ArtifactIndexRequest = {
					artifacts: snapshot.artifacts,
				}
				if (!snapshot.truncated) body.replaceKinds = INDEXED_KINDS
				void apiRequest(apiRoutes.boardArtifacts(boardID), {
					body: JSON.stringify(body),
					method: 'POST',
				}).catch(() => undefined)
			}, INDEX_DELAY_MS)
		}
		const stopListening = editor.store.listen((entry) => {
			const hasShapeChanges = [
				entry.changes.added,
				entry.changes.updated,
				entry.changes.removed,
			].some((changes) => Object.values(changes).some((record) => {
				const value = Array.isArray(record) ? record[1] : record
				return value.typeName === 'shape'
			}))
			if (hasShapeChanges && !stopped) schedule()
		}, { scope: 'document' })
		schedule()
		return () => {
			stopped = true
			if (timer) window.clearTimeout(timer)
			stopListening()
		}
	}, [boardID, editor, enabled])
}

export function collectCanvasArtifacts(editor: Editor) {
	const artifacts: StudyArtifactInput[] = []
	let textShapeCount = 0
	for (const page of editor.getPages()) {
		for (const shapeID of editor.getPageShapeIds(page)) {
			const shape = editor.getShape(shapeID)
			if (!shape) continue
			const artifact = toArtifact(editor, shape)
			if (!artifact) continue
			textShapeCount += 1
			if (artifacts.length < MAX_INDEXED_SHAPES) artifacts.push(artifact)
		}
	}
	return {
		artifacts,
		truncated: textShapeCount > MAX_INDEXED_SHAPES,
	}
}

function toArtifact(editor: Editor, shape: TLShape): StudyArtifactInput | null {
	const text = (editor.getShapeUtil(shape).getText(shape) ?? '').trim().slice(0, 8_000)
	if (!text) return null
	const props = artifactPropsSchema.parse(shape.props)
	if (shape.type === 'note' || shape.type === 'text') {
		return artifact('note', shape, firstLine(text), text)
	}
	if (shape.type === FLASHCARD_SHAPE_TYPE) {
		const front = props.front ?? ''
		const back = props.back ?? ''
		return artifact('flashcard', shape, front || firstLine(text), text, {
			alternateAnswers: props.alternateAnswers ?? [],
			back,
			front,
		})
	}
	if (shape.type === QUIZ_SHAPE_TYPE) {
		const question = props.question ?? ''
		const options = props.options ?? []
		const correctIndex = props.correctIndex ?? 0
		const explanation = props.explanation ?? ''
		return artifact('quiz', shape, question || firstLine(text), text, {
			correctIndex,
			explanation,
			options,
			question,
		})
	}
	if (shape.type === REVIEW_SHAPE_TYPE) {
		return artifact('review-note', shape, props.title || firstLine(text), text)
	}
	if (shape.type === WALKTHROUGH_SHAPE_TYPE) {
		return artifact('walkthrough', shape, props.title || firstLine(text), text)
	}
	if (shape.type === CONCEPT_MAP_SHAPE_TYPE) {
		return artifact('concept-map', shape, props.title || firstLine(text), text)
	}
	if (shape.type === MATH_SHAPE_TYPE) {
		return artifact('equation', shape, 'Equation', text)
	}
	if (shape.type === TEACH_BACK_SHAPE_TYPE) {
		return artifact(
			'teach-back',
			shape,
			props.topic || firstLine(text),
			text
		)
	}
	return null
}

function artifact(
	kind: StudyArtifactKind,
	shape: TLShape,
	title: string,
	text: string,
	payload?: StudyArtifactInput['payload']
): StudyArtifactInput {
	return {
		kind,
		payload,
		shapeID: shape.id,
		text,
		title: title.slice(0, 160),
	}
}

function firstLine(value: string) {
	return value.split(/\r?\n/, 1)[0].slice(0, 160) || 'Canvas note'
}
