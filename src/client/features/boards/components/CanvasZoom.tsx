import { IconMap, IconMinus, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { DefaultMinimap, DefaultZoomMenu, TldrawUiToolbar, useEditor } from 'tldraw'

const ZOOM_ANIMATION = { animation: { duration: 140 } } as const

/**
 * Zoom controls with the minimap folded away behind a toggle: a study board is read at
 * reading zoom most of the time, so the map is opt-in rather than a permanent slab.
 */
export function CanvasZoom() {
	const editor = useEditor()
	const [showMinimap, setShowMinimap] = useState(false)

	return (
		<div aria-label="Zoom" className="CanvasIsland CanvasZoom" role="group">
			{showMinimap ? <div className="CanvasZoom-map"><DefaultMinimap /></div> : null}
			{/* tldraw's zoom menu is a Radix toolbar button, so it needs a toolbar around it. */}
			<TldrawUiToolbar className="CanvasZoom-controls" label="Zoom">
				<button
					aria-label="Zoom out"
					className="CanvasIsland-button"
					onClick={() => editor.zoomOut(undefined, ZOOM_ANIMATION)}
					title="Zoom out"
					type="button"
				>
					<IconMinus size={16} stroke={1.8} />
				</button>
				{/* tldraw's own menu: zoom to fit, zoom to selection and the presets all come with it. */}
				<DefaultZoomMenu />
				<button
					aria-label="Zoom in"
					className="CanvasIsland-button"
					onClick={() => editor.zoomIn(undefined, ZOOM_ANIMATION)}
					title="Zoom in"
					type="button"
				>
					<IconPlus size={16} stroke={1.8} />
				</button>
				<span aria-hidden="true" className="CanvasIsland-divider" />
				<button
					aria-label={showMinimap ? 'Hide minimap' : 'Show minimap'}
					aria-pressed={showMinimap}
					className="CanvasIsland-button"
					data-active={showMinimap}
					onClick={() => setShowMinimap(!showMinimap)}
					title={showMinimap ? 'Hide minimap' : 'Show minimap'}
					type="button"
				>
					<IconMap size={16} stroke={1.8} />
				</button>
			</TldrawUiToolbar>
		</div>
	)
}
