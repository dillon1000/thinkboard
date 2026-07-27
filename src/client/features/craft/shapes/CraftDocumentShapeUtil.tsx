import {
	CRAFT_DOCUMENT_SHAPE_TYPE,
	craftDocumentShapeProps,
	type CraftDocumentLink,
	type CraftDocumentShapeProps,
} from '@agentboard/shared'
import { IconBrandCraft, IconEye } from '@tabler/icons-react'
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	createShapeId,
	type Editor,
	type TLShape,
} from 'tldraw'
import { openCraftDocumentPreview } from '../craftPreviewEvent'
import './craftDocumentShape.css'

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		[CRAFT_DOCUMENT_SHAPE_TYPE]: CraftDocumentShapeProps
	}
}

export type CraftDocumentShape = TLShape<typeof CRAFT_DOCUMENT_SHAPE_TYPE>

const CRAFT_DOCUMENT_WIDTH = 320
const CRAFT_DOCUMENT_HEIGHT = 150
const CRAFT_DOCUMENT_GAP = 24
const CRAFT_DOCUMENT_VIEWPORT_PADDING = 32

export class CraftDocumentShapeUtil extends BaseBoxShapeUtil<CraftDocumentShape> {
	static override type = CRAFT_DOCUMENT_SHAPE_TYPE
	static override props = craftDocumentShapeProps

	override canResize() {
		return true
	}

	override isAspectRatioLocked() {
		return false
	}

	override getDefaultProps(): CraftDocumentShape['props'] {
		return {
			documentID: '',
			h: CRAFT_DOCUMENT_HEIGHT,
			linkID: '',
			schemaVersion: 1,
			title: 'Craft document',
			w: CRAFT_DOCUMENT_WIDTH,
		}
	}

	/** The tutor sees the linked document title when it reads this shape from the canvas. */
	override getText(shape: CraftDocumentShape) {
		return `Linked Craft document: ${shape.props.title}`
	}

	override component(shape: CraftDocumentShape) {
		return <CraftDocumentCard shape={shape} />
	}

	override getIndicatorPath(shape: CraftDocumentShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 10)
		return path
	}
}

function CraftDocumentCard({ shape }: { shape: CraftDocumentShape }) {
	return (
		<HTMLContainer className="CraftDocumentShape">
			<div className="CraftDocumentShape-heading">
				<span>Craft document</span>
				<IconBrandCraft aria-hidden="true" size={17} stroke={1.8} />
			</div>
			<div className="CraftDocumentShape-body">
				<strong>{shape.props.title}</strong>
				<span>Linked live from Craft</span>
				<button
					onClick={() => openCraftDocumentPreview(shape.props.linkID)}
					onPointerDown={(event) => event.stopPropagation()}
					onTouchEnd={(event) => event.stopPropagation()}
					onTouchStart={(event) => event.stopPropagation()}
					type="button"
				>
					<IconEye aria-hidden="true" size={15} stroke={1.8} />
					Preview
				</button>
			</div>
		</HTMLContainer>
	)
}

/**
 * Adds one synchronized canvas shape for a linked Craft document. Existing shapes are selected
 * rather than copied, and new shapes use a simple viewport grid so several imports stay visible.
 */
export function addCraftDocumentShape(editor: Editor, document: CraftDocumentLink) {
	const existing = getCraftDocumentShapes(editor, document.id)[0]
	if (existing) {
		editor.select(existing.id)
		return existing.id
	}

	const viewport = editor.getViewportPageBounds()
	const shapeCount = getCraftDocumentShapes(editor).length
	const availableWidth = Math.max(
		CRAFT_DOCUMENT_WIDTH,
		viewport.w - CRAFT_DOCUMENT_VIEWPORT_PADDING * 2
	)
	const columns = Math.max(
		1,
		Math.floor((availableWidth + CRAFT_DOCUMENT_GAP) /
			(CRAFT_DOCUMENT_WIDTH + CRAFT_DOCUMENT_GAP))
	)
	const column = shapeCount % columns
	const row = Math.floor(shapeCount / columns)
	const id = createShapeId()

	editor.markHistoryStoppingPoint('add Craft document')
	editor.createShape({
		id,
		type: CRAFT_DOCUMENT_SHAPE_TYPE,
		x: viewport.x + CRAFT_DOCUMENT_VIEWPORT_PADDING +
			column * (CRAFT_DOCUMENT_WIDTH + CRAFT_DOCUMENT_GAP),
		y: viewport.y + Math.max(72, viewport.h * 0.12) +
			row * (CRAFT_DOCUMENT_HEIGHT + CRAFT_DOCUMENT_GAP),
		props: {
			documentID: document.documentID,
			h: CRAFT_DOCUMENT_HEIGHT,
			linkID: document.id,
			schemaVersion: 1,
			title: document.title,
			w: CRAFT_DOCUMENT_WIDTH,
		},
	})
	editor.select(id)
	return id
}

/**
 * Removes every canvas shape for a deleted board link. This changes only the synchronized board
 * record; the caller owns the Craft link deletion and reports any server failure first.
 */
export function removeCraftDocumentShapes(editor: Editor, linkID: string) {
	const shapeIDs = getCraftDocumentShapes(editor, linkID).map(({ id }) => id)
	if (shapeIDs.length) editor.deleteShapes(shapeIDs)
}

function getCraftDocumentShapes(editor: Editor, linkID?: string) {
	return editor.getCurrentPageShapes().flatMap((shape): CraftDocumentShape[] => {
		if (shape.type !== CRAFT_DOCUMENT_SHAPE_TYPE) return []
		const craftShape = shape as CraftDocumentShape
		return !linkID || craftShape.props.linkID === linkID ? [craftShape] : []
	})
}
