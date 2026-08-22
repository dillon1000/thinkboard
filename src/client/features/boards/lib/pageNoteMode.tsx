import type { BoardNoteMode, PageTexture } from '@agentboard/shared'
import type { TldrawOptions } from 'tldraw'

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
		? { camera: pageCamera, deepLinks: true }
		: { deepLinks: true }
}

/** Replaces the infinite canvas background with a desk around the constrained page. */
export function PageCanvasBackground() {
	return <div className="PageCanvas-background" />
}

/** Renders beneath tldraw shapes in page coordinates, so zooming and panning move the paper. */
export function NotePageSurface({ texture }: { texture: PageTexture }) {
	return (
		<div
			aria-hidden="true"
			className="NotePage-surface"
			data-texture={texture}
			style={{ height: NOTE_PAGE_SIZE.h, width: NOTE_PAGE_SIZE.w }}
		/>
	)
}
