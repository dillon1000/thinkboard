import { LECTURE_SHAPE_TYPE } from '@agentboard/shared'
import type { Editor, TLShape } from 'tldraw'
import { z } from 'zod'

const lectureCitationShapePropsSchema = z.object({ lectureID: z.string() })

export interface LectureCitationTarget {
	lectureID: string
	startSecond: number
}

export function parseLectureCitationHref(
	href: string | undefined
): LectureCitationTarget | null {
	if (!href?.startsWith('#lecture=')) return null
	const parameters = new URLSearchParams(href.slice(1))
	const lectureID = parameters.get('lecture')?.trim()
	const startSecond = Number(parameters.get('t'))
	if (!lectureID || !Number.isFinite(startSecond) || startSecond < 0) return null
	return { lectureID, startSecond }
}

export function findLectureCitationShape(
	shapes: Iterable<TLShape>,
	target: LectureCitationTarget
) {
	for (const shape of shapes) {
		const props = lectureCitationShapePropsSchema.safeParse(shape.props)
		if (
			shape.type === LECTURE_SHAPE_TYPE &&
			props.success && props.data.lectureID === target.lectureID
		) return shape
	}
	return null
}

/**
 * Moves to a lecture shape and asks its private audio player to seek.
 * The delayed event lets tldraw mount a shape after a page change.
 */
export function focusLectureCitation(editor: Editor, target: LectureCitationTarget) {
	const shapes: TLShape[] = []
	for (const page of editor.getPages()) {
		for (const shapeID of editor.getPageShapeIds(page)) {
			const shape = editor.getShape(shapeID)
			if (shape) shapes.push(shape)
		}
	}
	const shape = findLectureCitationShape(shapes, target)
	if (!shape) return false
	const pageID = editor.getAncestorPageId(shape)
	if (pageID && pageID !== editor.getCurrentPageId()) editor.setCurrentPage(pageID)
	editor.setSelectedShapes([shape.id])
	editor.zoomToSelection({ animation: { duration: 280 } })
	window.setTimeout(() => {
		window.dispatchEvent(new CustomEvent('agentboard:lecture-seek', { detail: target }))
	}, 0)
	return true
}
