import { MATH_SHAPE_TYPE } from '@agentboard/shared'
import { StateNode, createShapeId } from 'tldraw'

/**
 * Click-to-place rather than drag-to-size: an equation has no size of its own until it has been
 * typed, so the shape lands at the pointer and goes straight into editing.
 */
export class MathShapeTool extends StateNode {
	static override id = 'math'

	override onEnter() {
		this.editor.setCursor({ type: 'cross', rotation: 0 })
	}

	override onPointerDown() {
		const id = createShapeId()
		const { x, y } = this.editor.inputs.currentPagePoint

		this.editor.markHistoryStoppingPoint('creating equation')
		this.editor.createShape({ id, type: MATH_SHAPE_TYPE, x, y })
		this.editor.select(id)
		this.editor.setEditingShape(id)
		this.editor.setCurrentTool('select.editing_shape')
	}

	override onCancel() {
		this.editor.setCurrentTool('select')
	}
}
