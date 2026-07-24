import {
	IconArrowNarrowRight,
	IconCircle,
	IconDots,
	IconEraser,
	IconHandStop,
	IconHighlight,
	IconLetterT,
	IconMathFunction,
	IconNote,
	IconPencil,
	IconPointer,
	IconSquare,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import {
	GeoShapeGeoStyle,
	MobileStylePanel,
	PORTRAIT_BREAKPOINT,
	type TLUiToolItem,
	TldrawUiIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	useBreakpoint,
	useEditor,
	useIsToolSelected,
	useTools,
	useValue,
} from 'tldraw'
import { SpotifyPlayer } from '../../spotify/components/SpotifyPlayer'

interface RailTool {
	icon: ReactNode
	id: string
	label: string
}

/**
 * Grouped by what the tool is for — move around, mark up, write, build — so the dividers
 * carry meaning instead of just breaking up a row of icons.
 */
const TOOL_GROUPS: RailTool[][] = [
	[
		{ icon: <IconPointer size={17} stroke={1.7} />, id: 'select', label: 'Select' },
		{ icon: <IconHandStop size={17} stroke={1.7} />, id: 'hand', label: 'Pan' },
	],
	[
		{ icon: <IconPencil size={17} stroke={1.7} />, id: 'draw', label: 'Draw' },
		{ icon: <IconHighlight size={17} stroke={1.7} />, id: 'highlight', label: 'Highlight' },
		{ icon: <IconEraser size={17} stroke={1.7} />, id: 'eraser', label: 'Erase' },
	],
	[
		{ icon: <IconLetterT size={17} stroke={1.7} />, id: 'text', label: 'Text' },
		{ icon: <IconNote size={17} stroke={1.7} />, id: 'note', label: 'Note' },
		{ icon: <IconMathFunction size={17} stroke={1.7} />, id: 'math', label: 'Equation' },
	],
	[
		{ icon: <IconArrowNarrowRight size={17} stroke={1.7} />, id: 'arrow', label: 'Arrow' },
		{ icon: <IconSquare size={17} stroke={1.7} />, id: 'rectangle', label: 'Rectangle' },
		{ icon: <IconCircle size={17} stroke={1.7} />, id: 'ellipse', label: 'Ellipse' },
	],
]

const RAIL_TOOL_IDS = new Set(TOOL_GROUPS.flat().map((tool) => tool.id))

export function CanvasToolbar() {
	const tools = useTools()
	const breakpoint = useBreakpoint()
	const overflowTools = Object.values(tools).filter((tool) => !RAIL_TOOL_IDS.has(tool.id))

	return (
		<div className="CanvasBottomDock">
			<SpotifyPlayer />
			<div aria-label="Canvas tools" className="CanvasIsland CanvasRail" role="toolbar">
				{TOOL_GROUPS.map((group, index) => (
					<div className="CanvasRail-group" key={group[0].id}>
						{index > 0 ? <span aria-hidden="true" className="CanvasIsland-divider" /> : null}
						{group.map((tool) => <ToolButton key={tool.id} {...tool} />)}
					</div>
				))}
				<div className="CanvasRail-group">
					<span aria-hidden="true" className="CanvasIsland-divider" />
					<ToolOverflow tools={overflowTools} />
					{/* Wide layouts get the docked style panel instead; below that it lives behind this button. */}
					{breakpoint < PORTRAIT_BREAKPOINT.TABLET_SM ? <MobileStylePanel /> : null}
				</div>
			</div>
		</div>
	)
}

function ToolButton({ icon, id, label }: RailTool) {
	const tools = useTools()
	const tool = tools[id]
	const isSelected = useIsToolSelected(tool)

	if (!tool) return null

	return (
		<button
			aria-label={label}
			aria-pressed={isSelected}
			className="CanvasIsland-button"
			data-active={isSelected}
			onClick={() => tool.onSelect('toolbar')}
			title={toolTitle(label, tool)}
			type="button"
		>
			{icon}
		</button>
	)
}

function ToolOverflow({ tools }: { tools: TLUiToolItem[] }) {
	const editor = useEditor()
	// The rail can only show ten tools; this keeps every other one reachable and marks the
	// button when the active tool is hiding inside it.
	const isActive = useValue(
		'overflow tool active',
		() => {
			const toolID = editor.getCurrentToolId()
			const activeID = toolID === 'geo' ? editor.getStyleForNextShape(GeoShapeGeoStyle) : toolID
			return tools.some((tool) => tool.id === activeID)
		},
		[editor, tools],
	)

	return (
		<TldrawUiPopover id="canvas-tool-overflow">
			<TldrawUiPopoverTrigger>
				<button
					aria-label="More tools"
					className="CanvasIsland-button"
					data-active={isActive}
					title="More tools"
					type="button"
				>
					<IconDots size={17} stroke={1.7} />
				</button>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent align="end" side="top" sideOffset={8}>
				<div className="CanvasOverflow">
					{tools.map((tool) => <OverflowToolButton key={tool.id} tool={tool} />)}
				</div>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}

function OverflowToolButton({ tool }: { tool: TLUiToolItem }) {
	const isSelected = useIsToolSelected(tool)
	const label = toolLabel(tool.id)

	return (
		<button
			aria-label={label}
			aria-pressed={isSelected}
			className="CanvasIsland-button"
			data-active={isSelected}
			onClick={() => tool.onSelect('toolbar')}
			title={toolTitle(label, tool)}
			type="button"
		>
			<TldrawUiIcon icon={tool.icon} label={label} small />
		</button>
	)
}

function toolTitle(label: string, tool: TLUiToolItem) {
	const shortcut = tool.kbd?.split(',')[0]?.toUpperCase()
	return shortcut ? `${label} — ${shortcut}` : label
}

/** tldraw labels are translation keys; tool ids are already readable once unhyphenated. */
function toolLabel(id: string) {
	const words = id.replace(/-/g, ' ')
	return words.charAt(0).toUpperCase() + words.slice(1)
}
