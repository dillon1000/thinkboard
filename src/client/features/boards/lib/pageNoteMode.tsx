import type { BoardNoteMode, PageTexture } from '@agentboard/shared'
import { MAX_PDF_PAGES } from '@agentboard/shared'
import { IconFileUpload } from '@tabler/icons-react'
import { useEditor, useValue, type TldrawOptions } from 'tldraw'
import { requestDocumentImport } from '../../study/lib/documentImportEvent'

/** US Letter at 96 CSS pixels per inch; changing it changes every blank note sheet and camera. */
export const NOTE_PAGE_SIZE = { h: 1_056, w: 816 } as const

const pageCamera = {
	constraints: {
		baseZoom: 'fit-min-100',
		behavior: 'contain',
		bounds: { h: NOTE_PAGE_SIZE.h, w: NOTE_PAGE_SIZE.w, x: 0, y: 0 },
		initialZoom: 'fit-min-100',
		origin: { x: 0.5, y: 0.5 },
		padding: { x: 64, y: 64 },
	},
	wheelBehavior: 'pan',
} satisfies Partial<TldrawOptions['camera']>

/** Selects the camera model once when the editor mounts. Page spaces stay within one sheet. */
export function getCanvasOptions(noteMode: BoardNoteMode): Partial<TldrawOptions> {
	return noteMode === 'pages'
		? { camera: pageCamera, deepLinks: true, maxPages: MAX_PDF_PAGES }
		: { deepLinks: true }
}

/** Replaces the infinite canvas background with a desk around the constrained page. */
export function PageCanvasBackground() {
	return <div className="PageCanvas-background" />
}

/** Renders beneath tldraw shapes in page coordinates, so zooming and panning move the paper. */
export function NotePageSurface({ texture }: { texture: PageTexture }) {
	const editor = useEditor()
	const isEmpty = useValue(
		'current note page is empty',
		() => editor.getCurrentPageShapeIds().size === 0,
		[editor]
	)
	return (
		<div
			aria-hidden="true"
			className="NotePage-surface"
			data-texture={texture}
			style={{ height: NOTE_PAGE_SIZE.h, width: NOTE_PAGE_SIZE.w }}
		>
			{isEmpty ? (
				<button
					className="NotePage-useFile"
					onClick={requestDocumentImport}
					onPointerDown={editor.markEventAsHandled}
					type="button"
				>
					<span><IconFileUpload aria-hidden="true" size={20} stroke={1.6} /></span>
					<strong>Use a file as your pages</strong>
					<small>PDF, Word, or PowerPoint</small>
				</button>
			) : null}
		</div>
	)
}
