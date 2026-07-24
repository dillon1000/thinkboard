import type { TLComponents } from 'tldraw'
import { CanvasMenuPanel } from '../components/CanvasMenuPanel'
import { CanvasStylePanel } from '../components/CanvasStylePanel'
import { CanvasToolbar } from '../components/CanvasToolbar'
import { CanvasZoom } from '../components/CanvasZoom'
import { InlinePrompt } from '../components/InlinePrompt'
import { LockInCanvasOverlay } from '../../lock-in/LockInCanvasOverlay'

/**
 * tldraw's chrome is recomposed rather than restyled: three islands and a style panel, each
 * built from tldraw's own menus and pickers so nothing upstream can do is lost. The help
 * menu is the one component dropped — its keyboard shortcuts live in the board menu.
 *
 * Built per board because the cursor-side agent needs to know which board it is answering for.
 */
export function createCanvasComponents(boardID: string): TLComponents {
	return {
		HelpMenu: null,
		InFrontOfTheCanvas: () => (
			<>
				<LockInCanvasOverlay />
				<InlinePrompt boardID={boardID} />
			</>
		),
		MenuPanel: CanvasMenuPanel,
		NavigationPanel: CanvasZoom,
		StylePanel: CanvasStylePanel,
		Toolbar: CanvasToolbar,
	}
}
