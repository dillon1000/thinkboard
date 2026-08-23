import {
	NOTE_PAGE_SHAPE_TYPE,
	PDF_PAGE_SHAPE_TYPE,
	notePageShapeProps,
	type BoardNoteMode,
	type NotePageShapeProps,
	type PageOrientation,
	type PageTexture,
} from '@agentboard/shared'
import { IconFileUpload } from '@tabler/icons-react'
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	Rectangle2d,
	createShapeId,
	type Editor,
	type TLShape,
	type TldrawOptions,
	useEditor,
	useValue,
} from 'tldraw'
import { requestDocumentImport } from '../../study/lib/documentImportEvent'

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		[NOTE_PAGE_SHAPE_TYPE]: NotePageShapeProps
	}
}

export type NotePageShape = TLShape<typeof NOTE_PAGE_SHAPE_TYPE>

/** US Letter at 96 CSS pixels per inch. */
export const NOTE_PAGE_SIZES = {
	landscape: { h: 816, w: 1_056 },
	portrait: { h: 1_056, w: 816 },
} as const
export const NOTE_PAGE_SIZE = NOTE_PAGE_SIZES.portrait
export const NOTE_PAGE_GAP = 96
const NOTEBOOK_WIDTH = NOTE_PAGE_SIZES.landscape.w

/** Page spaces use one tldraw canvas; notebook sheets are synchronized background shapes. */
export function getCanvasOptions(noteMode: BoardNoteMode): Partial<TldrawOptions> {
	return noteMode === 'pages'
		? { deepLinks: true, maxPages: 1 }
		: { deepLinks: true }
}

export function PageCanvasBackground() {
	return <div className="PageCanvas-background" />
}

export class NotePageShapeUtil extends BaseBoxShapeUtil<NotePageShape> {
	static override type = NOTE_PAGE_SHAPE_TYPE
	static override props = notePageShapeProps

	override canEdit() { return false }
	override canResize() { return false }
	override getDefaultProps(): NotePageShape['props'] {
		return { ...NOTE_PAGE_SIZE, orientation: 'portrait', pageNumber: 1, texture: 'blank' }
	}
	override getGeometry(shape: NotePageShape) {
		return new Rectangle2d({ height: shape.props.h, isFilled: false, width: shape.props.w })
	}
	override component(shape: NotePageShape) { return <NotePageSurface shape={shape} /> }
	override getIndicatorPath(shape: NotePageShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

function NotePageSurface({ shape }: { shape: NotePageShape }) {
	const editor = useEditor()
	const isNotebookEmpty = useValue(
		'notebook has no student content',
		() => editor.getCurrentPageShapes().every(({ type }) =>
			type === NOTE_PAGE_SHAPE_TYPE || type === PDF_PAGE_SHAPE_TYPE
		),
		[editor]
	)
	return (
		<HTMLContainer
			className="NotePage-surface"
			data-orientation={shape.props.orientation}
			data-texture={shape.props.texture}
		>
			{shape.props.pageNumber === 1 && isNotebookEmpty ? (
				<button
					className="NotePage-useFile"
					onClick={requestDocumentImport}
					onPointerDown={(event) => event.stopPropagation()}
					type="button"
				>
					<span><IconFileUpload aria-hidden="true" size={20} stroke={1.6} /></span>
					<strong>Use a file as your pages</strong>
					<small>PDF, Word, or PowerPoint</small>
				</button>
			) : null}
		</HTMLContainer>
	)
}

export function ensureInitialNotePage(
	editor: Editor,
	texture: PageTexture,
	orientation: PageOrientation
) {
	if (getNotebookPageShapes(editor).length) return
	createNotePage(editor, texture, orientation, createShapeId('notebook-page-1'))
}

/** Adds a paper sheet below the current notebook without creating a tldraw page. */
export function createNotePage(
	editor: Editor,
	texture: PageTexture,
	orientation: PageOrientation,
	id = createShapeId()
) {
	const pages = getNotebookPageShapes(editor)
	const size = NOTE_PAGE_SIZES[orientation]
	const y = pages.reduce((bottom, page) => {
		const bounds = editor.getShapePageBounds(page)
		return bounds ? Math.max(bottom, bounds.maxY + NOTE_PAGE_GAP) : bottom
	}, 0)
	const x = (NOTEBOOK_WIDTH - size.w) / 2
	editor.markHistoryStoppingPoint('add notebook page')
	editor.createShape({
		id,
		isLocked: true,
		props: { ...size, orientation, pageNumber: pages.length + 1, texture },
		type: NOTE_PAGE_SHAPE_TYPE,
		x,
		y,
	})
	editor.sendToBack([id])
	editor.zoomToBounds({ ...size, x, y }, { animation: { duration: 220 }, inset: 56 })
	return id
}

export function getNotebookPageShapes(editor: Editor) {
	return editor.getCurrentPageShapes().filter(({ type }) =>
		type === NOTE_PAGE_SHAPE_TYPE || type === PDF_PAGE_SHAPE_TYPE
	)
}
