import type { BoardNoteMode, PageTexture } from '@agentboard/shared'
import type { TLComponents } from 'tldraw'
import { CanvasRibbon } from '../components/CanvasRibbon'
import { InlinePrompt } from '../components/InlinePrompt'
import { ZenRadialMenu } from '../components/ZenRadialMenu'
import { LockInCanvasOverlay } from '../../lock-in/LockInCanvasOverlay'
import { ProjectorModeLayer } from '../components/ProjectorModeLayer'
import { PageCanvasBackground } from './pageNoteMode'

/**
 * The canvas carries one piece of chrome: a ribbon along the top that absorbs everything that
 * used to float over the board — tldraw's menus, tools, style pickers and zoom, plus our own
 * timer, Spotify player, PDF import, theme switch and study toggle. tldraw's own panel slots are
 * emptied so nothing renders twice; their contents are recomposed inside the ribbon's bands, so
 * every menu, picker and shortcut still behaves the way it does upstream.
 *
 * Built per board because the ribbon and the cursor-side agent both need to know which board
 * they are acting on.
 */
export function createCanvasComponents(
	boardID: string,
	noteMode: BoardNoteMode,
	pageTexture: PageTexture
): TLComponents {
	const components: TLComponents = {
		HelpMenu: null,
		InFrontOfTheCanvas: () => (
			<>
				<LockInCanvasOverlay />
				<InlinePrompt boardID={boardID} />
				<ZenRadialMenu />
				<ProjectorModeLayer />
			</>
		),
		/* The top-left slot is stretched to the full width in CSS; the ribbon owns that whole row. */
		MenuPanel: () => (
			<CanvasRibbon
				boardID={boardID}
				noteMode={noteMode}
				pageTexture={pageTexture}
			/>
		),
		NavigationPanel: null,
		StylePanel: null,
		Toolbar: null,
		TopPanel: null,
	}
	if (noteMode === 'pages') {
		components.Background = PageCanvasBackground
	}
	return components
}
