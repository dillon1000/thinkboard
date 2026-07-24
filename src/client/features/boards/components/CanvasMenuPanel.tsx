import { IconArrowBackUp, IconArrowForwardUp, IconCopy, IconTrash } from '@tabler/icons-react'
import {
	DefaultActionsMenu,
	DefaultMainMenu,
	DefaultPageMenu,
	TldrawUiToolbar,
	useActions,
	useEditor,
	useUnlockedSelectedShapesCount,
	useValue,
} from 'tldraw'
import { CanvasTimer } from './CanvasTimer'

/**
 * The board menu, page switcher, history and shape actions in one island, so the canvas keeps
 * a single top-left stack: identity in the header above, document actions here.
 */
export function CanvasMenuPanel() {
	const editor = useEditor()
	const actions = useActions()
	const canUndo = useValue('canUndo', () => editor.getCanUndo(), [editor])
	const canRedo = useValue('canRedo', () => editor.getCanRedo(), [editor])
	const isInSelectState = useValue('isInSelectState', () => editor.isIn('select'), [editor])
	const hasSelection = Boolean(useUnlockedSelectedShapesCount(1))
	const canActOnSelection = hasSelection && isInSelectState

	return (
		<div className="CanvasMenuStack">
			<div className="CanvasIsland CanvasMenu">
				<DefaultMainMenu />
				<DefaultPageMenu />
				<span aria-hidden="true" className="CanvasIsland-divider" />
				{/* tldraw's actions menu is a Radix toolbar button, so it needs a toolbar around it. */}
				<TldrawUiToolbar className="CanvasMenu-actions" label="Actions">
					<button
						aria-label="Undo"
						className="CanvasIsland-button"
						disabled={!canUndo}
						onClick={() => editor.undo()}
						title="Undo"
						type="button"
					>
						<IconArrowBackUp size={17} stroke={1.7} />
					</button>
					<button
						aria-label="Redo"
						className="CanvasIsland-button"
						disabled={!canRedo}
						onClick={() => editor.redo()}
						title="Redo"
						type="button"
					>
						<IconArrowForwardUp size={17} stroke={1.7} />
					</button>
					<button
						aria-label="Duplicate"
						className="CanvasIsland-button"
						disabled={!canActOnSelection}
						onClick={() => actions.duplicate?.onSelect('quick-actions')}
						title="Duplicate"
						type="button"
					>
						<IconCopy size={17} stroke={1.7} />
					</button>
					<button
						aria-label="Delete"
						className="CanvasIsland-button"
						disabled={!canActOnSelection}
						onClick={() => actions.delete?.onSelect('quick-actions')}
						title="Delete"
						type="button"
					>
						<IconTrash size={17} stroke={1.7} />
					</button>
					{/* Align, distribute, stack, reorder, rotate, group — tldraw's menu, sized to this island. */}
					<DefaultActionsMenu />
				</TldrawUiToolbar>
			</div>
			<CanvasTimer />
		</div>
	)
}
