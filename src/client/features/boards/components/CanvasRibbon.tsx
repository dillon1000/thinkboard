import { appRoutes } from '@agentboard/shared'
import {
	IconAdjustmentsHorizontal,
	IconArrowBackUp,
	IconArrowForwardUp,
	IconArrowNarrowRight,
	IconCheck,
	IconChevronRight,
	IconCircle,
	IconCopy,
	IconDeviceProjector,
	IconDeviceTablet,
	IconEraser,
	IconFocusCentered,
	IconHandStop,
	IconHighlight,
	IconLayoutSidebarRightCollapse,
	IconLayoutSidebarRightExpand,
	IconLetterT,
	IconLock,
	IconMap,
	IconMathFunction,
	IconMinus,
	IconMoon,
	IconNote,
	IconPencil,
	IconPlayerPause,
	IconPlayerPlay,
	IconPlus,
	IconPointer,
	IconShape,
	IconSquare,
	IconSun,
	IconTrash,
	IconX,
} from '@tabler/icons-react'
import { type CSSProperties, type ReactNode, useState } from 'react'
import {
	DefaultActionsMenu,
	DefaultMainMenu,
	DefaultMinimap,
	DefaultPageMenu,
	DefaultZoomMenu,
	GeoShapeGeoStyle,
	type TLUiToolItem,
	TldrawUiIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiToolbar,
	useActions,
	useEditor,
	useIsToolSelected,
	useTools,
	useUnlockedSelectedShapesCount,
	useValue,
} from 'tldraw'
import { ThinkspaceIcon, ThinkspaceWordmark } from '../../../components/ThinkspaceWordmark'
import { useTheme } from '../../theme/ThemeProvider'
import { useLockIn } from '../../lock-in/LockInProvider'
import {
	formatLockInTime,
	getLockInElapsedMS,
	getLockInRemainingMS,
} from '../../lock-in/lib/lockInSession'
import { SpotifyPlayer } from '../../spotify/components/SpotifyPlayer'
import { PDFImportControl } from '../../study/components/PDFImportControl'
import { useBoardChrome } from '../lib/BoardChromeProvider'
import { useZenMode } from '../lib/ZenModeProvider'
import { useProjectorMode } from '../lib/ProjectorModeProvider'
import { RIBBON_MENU_IDS, type RibbonMenuID } from '../lib/ribbonPreference'
import {
	CanvasColourControls,
	CanvasStyleControls,
	useCurrentColourValue,
} from './CanvasStyleControls'
import { CanvasTimer } from './CanvasTimer'
import { DockablePanel } from './DockablePanel'
import { RibbonSection } from './RibbonSection'

const ZOOM_ANIMATION = { animation: { duration: 140 } } as const

const MENU_LABELS: Record<RibbonMenuID, string> = {
	board: 'Board',
	colour: 'Colour',
	edit: 'Edit',
	style: 'Stroke & size',
	tools: 'More tools',
	view: 'View',
}

interface RibbonTool {
	icon: ReactNode
	id: string
	label: string
}

/**
 * The tools that stay on the bar. Everything else lives one click away in the tools dropdown:
 * these are the ones a study session reaches for without thinking.
 */
const QUICK_TOOLS: RibbonTool[] = [
	{ icon: <IconPointer size={17} stroke={1.7} />, id: 'select', label: 'Select' },
	{ icon: <IconPencil size={17} stroke={1.7} />, id: 'draw', label: 'Draw' },
	{ icon: <IconHighlight size={17} stroke={1.7} />, id: 'highlight', label: 'Highlight' },
	{ icon: <IconEraser size={17} stroke={1.7} />, id: 'eraser', label: 'Erase' },
	{ icon: <IconLetterT size={17} stroke={1.7} />, id: 'text', label: 'Text' },
	{ icon: <IconNote size={17} stroke={1.7} />, id: 'note', label: 'Note' },
]

/** Grouped by what the tool is for, so each section caption in the tools menu says something true. */
const TOOL_GROUPS: { label: string; tools: RibbonTool[] }[] = [
	{
		label: 'Navigate',
		tools: [
			{ icon: <IconPointer size={17} stroke={1.7} />, id: 'select', label: 'Select' },
			{ icon: <IconHandStop size={17} stroke={1.7} />, id: 'hand', label: 'Pan' },
		],
	},
	{
		label: 'Draw',
		tools: [
			{ icon: <IconPencil size={17} stroke={1.7} />, id: 'draw', label: 'Draw' },
			{ icon: <IconHighlight size={17} stroke={1.7} />, id: 'highlight', label: 'Highlight' },
			{ icon: <IconEraser size={17} stroke={1.7} />, id: 'eraser', label: 'Erase' },
		],
	},
	{
		label: 'Write',
		tools: [
			{ icon: <IconLetterT size={17} stroke={1.7} />, id: 'text', label: 'Text' },
			{ icon: <IconNote size={17} stroke={1.7} />, id: 'note', label: 'Note' },
			{ icon: <IconMathFunction size={17} stroke={1.7} />, id: 'math', label: 'Equation' },
		],
	},
	{
		label: 'Shapes',
		tools: [
			{ icon: <IconArrowNarrowRight size={17} stroke={1.7} />, id: 'arrow', label: 'Arrow' },
			{ icon: <IconSquare size={17} stroke={1.7} />, id: 'rectangle', label: 'Rectangle' },
			{ icon: <IconCircle size={17} stroke={1.7} />, id: 'ellipse', label: 'Ellipse' },
		],
	},
]

const NAMED_TOOL_IDS = new Set(TOOL_GROUPS.flatMap((group) => group.tools).map((tool) => tool.id))

/**
 * One menu bar in place of the islands that used to be scattered around the canvas. It stays a
 * single compact row — tldraw's board and page menus, then Board, Edit and View, then a quick
 * strip of the tools and style pickers worth reaching for without opening anything. Everything
 * else is one click deep. The bar is only as wide as its contents, so the player floats beside
 * it and the canvas keeps the rest of the width; the dock handle tucks the lot away.
 */
export function CanvasRibbon({ boardID }: { boardID: string }) {
	const chrome = useBoardChrome()
	const { session } = useLockIn()
	const [openMenu, setOpenMenu] = useState<RibbonMenuID | null>(null)
	const colour = useCurrentColourValue()

	/* Once one menu is open the bar behaves like a navigation menu: hovering another switches. */
	const menuProps = (id: RibbonMenuID) => ({
		id,
		onOpenChange: (open: boolean) => setOpenMenu(open ? id : null),
		onPointerEnter: () => openMenu && openMenu !== id && setOpenMenu(id),
		open: openMenu === id,
	})

	return (
		<div className="CanvasTopDock">
			<DockablePanel className="Dockable--ribbon" edge="top" id="ribbon" label="menu bar">
				<div aria-label="Board menu bar" className="Ribbon" role="menubar">
					<nav aria-label="Breadcrumb" className="Ribbon-crumbs">
						<a aria-label="Thinkspace Boards" className="Ribbon-home" href={appRoutes.home}>
							<ThinkspaceWordmark />
							<ThinkspaceIcon />
							<span>Boards</span>
						</a>
						<IconChevronRight aria-hidden="true" size={13} stroke={1.8} />
						<span className="Ribbon-title" data-board-id={boardID} title={chrome.title}>{chrome.title}</span>
					</nav>
					<span aria-hidden="true" className="Ribbon-divider" />
					{/* tldraw's board and page menus are already dropdowns; they join the bar as they are. */}
					<div className="Ribbon-slot">
						<DefaultMainMenu />
						<DefaultPageMenu />
					</div>
					<span aria-hidden="true" className="Ribbon-divider" />
					{RIBBON_MENU_IDS.map((id) => (
						<RibbonMenu key={id} {...menuProps(id)}>
							{id === 'board' ? <BoardMenu boardID={boardID} /> : null}
							{id === 'edit' ? <EditMenu /> : null}
							{id === 'view' ? <ViewMenu /> : null}
						</RibbonMenu>
					))}
					<span aria-hidden="true" className="Ribbon-divider" />
					<div className="Ribbon-tools">
						{QUICK_TOOLS.map((tool) => <ToolButton key={tool.id} {...tool} />)}
						<RibbonMenu {...menuProps('tools')} icon={<IconShape size={17} stroke={1.7} />}>
							<ToolMenu />
						</RibbonMenu>
					</div>
					<span aria-hidden="true" className="Ribbon-divider" />
					<RibbonMenu
						{...menuProps('colour')}
						icon={<span className="Ribbon-swatch" style={{ '--swatch': colour ?? 'transparent' } as CSSProperties} />}
					>
						<CanvasColourControls />
					</RibbonMenu>
					<RibbonMenu {...menuProps('style')} icon={<IconAdjustmentsHorizontal size={17} stroke={1.7} />}>
						<CanvasStyleControls />
					</RibbonMenu>
				</div>
			</DockablePanel>
			<SpotifyPlayer />
			<div className="CanvasTopDock-quick">
				{session ? <LockInReadout /> : null}
				<span
					className={`Ribbon-status${chrome.isOnline ? '' : ' Ribbon-status--offline'}`}
					role="status"
				>
					{chrome.isOnline ? 'Live' : 'Offline'}
				</span>
				<button
					aria-controls="study-panel"
					aria-expanded={chrome.isStudyOpen}
					className="Ribbon-studyToggle"
					onClick={() => chrome.setStudyOpen(!chrome.isStudyOpen)}
					title={chrome.isStudyOpen ? 'Close study panel' : 'Open study panel'}
					type="button"
				>
					{chrome.isStudyOpen
						? <IconLayoutSidebarRightCollapse aria-hidden="true" size={15} stroke={1.8} key="collapse" />
						: <IconLayoutSidebarRightExpand aria-hidden="true" size={15} stroke={1.8} key="expand" />}
					<span>Study</span>
				</button>
			</div>
		</div>
	)
}

/** A bar trigger and the menu it drops. Named menus show their label; quick pickers show an icon. */
function RibbonMenu({
	children,
	icon,
	id,
	onOpenChange,
	onPointerEnter,
	open,
}: {
	children: ReactNode
	icon?: ReactNode
	id: RibbonMenuID
	onOpenChange: (open: boolean) => void
	onPointerEnter: () => void
	open: boolean
}) {
	const label = MENU_LABELS[id]

	return (
		<TldrawUiPopover id={`ribbon-${id}`} onOpenChange={onOpenChange} open={open}>
			<TldrawUiPopoverTrigger>
				<button
					aria-expanded={open}
					aria-label={label}
					className={icon ? 'Ribbon-menuTrigger Ribbon-menuTrigger--icon' : 'Ribbon-menuTrigger'}
					data-active={open}
					onPointerEnter={onPointerEnter}
					role="menuitem"
					title={label}
					type="button"
				>
					{icon ?? label}
				</button>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent align="start" side="bottom" sideOffset={7}>
				<div className="RibbonMenu">{children}</div>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}

function BoardMenu({ boardID }: { boardID: string }) {
	const editor = useEditor()
	const chrome = useBoardChrome()
	const { openSetup, session } = useLockIn()

	return (
		<>
			<RibbonSection label="Share">
				<RibbonItem
					icon={chrome.didCopyBoardLink
						? <IconCheck size={17} key="check" />
						: <IconCopy size={17} stroke={1.7} key="copy" />}
					label={chrome.didCopyBoardLink ? 'Link copied' : 'Copy board link'}
					onSelect={chrome.copyBoardLink}
				/>
				<PDFImportControl boardID={boardID} editor={editor} />
			</RibbonSection>
			<RibbonSection label="Session">
				<RibbonItem
					disabled={Boolean(session)}
					icon={<IconLock size={17} stroke={1.7} />}
					label="Start Lock In"
					onSelect={() => {
						chrome.setStudyOpen(false)
						openSetup()
					}}
				/>
				<CanvasTimer />
			</RibbonSection>
		</>
	)
}

function EditMenu() {
	const editor = useEditor()
	const actions = useActions()
	const canUndo = useValue('canUndo', () => editor.getCanUndo(), [editor])
	const canRedo = useValue('canRedo', () => editor.getCanRedo(), [editor])
	const isInSelectState = useValue('isInSelectState', () => editor.isIn('select'), [editor])
	const canActOnSelection = Boolean(useUnlockedSelectedShapesCount(1)) && isInSelectState

	return (
		<>
			<RibbonSection label="History">
				<RibbonItem
					disabled={!canUndo}
					icon={<IconArrowBackUp size={17} stroke={1.7} />}
					label="Undo"
					onSelect={() => editor.undo()}
				/>
				<RibbonItem
					disabled={!canRedo}
					icon={<IconArrowForwardUp size={17} stroke={1.7} />}
					label="Redo"
					onSelect={() => editor.redo()}
				/>
			</RibbonSection>
			<RibbonSection label="Selection">
				<RibbonItem
					disabled={!canActOnSelection}
					icon={<IconCopy size={17} stroke={1.7} />}
					label="Duplicate"
					onSelect={() => actions.duplicate?.onSelect('quick-actions')}
				/>
				<RibbonItem
					danger
					disabled={!canActOnSelection}
					icon={<IconTrash size={17} stroke={1.7} />}
					label="Delete"
					onSelect={() => actions.delete?.onSelect('quick-actions')}
				/>
				{/* Align, distribute, stack, reorder, rotate, group — tldraw's own menu, kept whole. */}
				<TldrawUiToolbar className="Ribbon-slot Ribbon-slot--wide" label="Arrange">
					<DefaultActionsMenu />
				</TldrawUiToolbar>
			</RibbonSection>
		</>
	)
}

function ToolMenu() {
	const tools = useTools()
	const overflowTools = Object.values(tools).filter((tool) => !NAMED_TOOL_IDS.has(tool.id))

	return (
		<>
			{TOOL_GROUPS.map((group) => (
				<RibbonSection key={group.label} label={group.label}>
					<div className="RibbonMenu-grid">
						{group.tools.map((tool) => <ToolButton key={tool.id} {...tool} />)}
					</div>
				</RibbonSection>
			))}
			<RibbonSection label="Everything else">
				<div className="RibbonMenu-grid">
					{overflowTools.map((tool) => <OverflowToolButton key={tool.id} tool={tool} />)}
				</div>
			</RibbonSection>
		</>
	)
}

function ViewMenu() {
	const editor = useEditor()
	const zen = useZenMode()
	const projector = useProjectorMode()
	const chrome = useBoardChrome()
	const { theme, toggleTheme } = useTheme()
	const [showMinimap, setShowMinimap] = useState(false)

	return (
		<>
			<RibbonSection label="Zoom">
				<div className="RibbonMenu-row">
					<button
						aria-label="Zoom out"
						className="RibbonMenu-step"
						onClick={() => editor.zoomOut(undefined, ZOOM_ANIMATION)}
						title="Zoom out"
						type="button"
					>
						<IconMinus size={16} stroke={1.8} />
					</button>
					{/* tldraw's own menu: zoom to fit, zoom to selection and the presets all come with it. */}
					<TldrawUiToolbar className="Ribbon-slot Ribbon-slot--zoom" label="Zoom">
						<DefaultZoomMenu />
					</TldrawUiToolbar>
					<button
						aria-label="Zoom in"
						className="RibbonMenu-step"
						onClick={() => editor.zoomIn(undefined, ZOOM_ANIMATION)}
						title="Zoom in"
						type="button"
					>
						<IconPlus size={16} stroke={1.8} />
					</button>
				</div>
				<RibbonItem
					active={showMinimap}
					icon={<IconMap size={17} stroke={1.7} />}
					label="Minimap"
					onSelect={() => setShowMinimap(!showMinimap)}
				/>
				{showMinimap ? <div className="RibbonMenu-map"><DefaultMinimap /></div> : null}
			</RibbonSection>
			<RibbonSection label="Appearance">
				<RibbonItem
					icon={theme === 'dark'
						? <IconSun size={17} stroke={1.7} key="sun" />
						: <IconMoon size={17} stroke={1.7} key="moon" />}
					label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
					onSelect={toggleTheme}
				/>
				<RibbonItem
					icon={<IconFocusCentered size={17} stroke={1.7} />}
					label="Zen mode"
					onSelect={() => zen.setEnabled(true)}
				/>
				<RibbonItem
					icon={<IconDeviceProjector size={17} stroke={1.7} />}
					label="Projector mode"
					onSelect={() => {
						zen.setEnabled(false)
						chrome.setStudyOpen(false)
						projector.enter(editor)
					}}
				/>
				<RibbonItem
					active={Boolean(projector.controllerCode)}
					icon={<IconDeviceTablet size={17} stroke={1.7} />}
					label={projector.controllerCode ? 'Projector connected' : 'Control projector'}
					onSelect={projector.openPairing}
				/>
				<RibbonItem
					active={chrome.isStudyOpen}
					icon={chrome.isStudyOpen
						? <IconLayoutSidebarRightCollapse size={17} stroke={1.7} key="collapse" />
						: <IconLayoutSidebarRightExpand size={17} stroke={1.7} key="expand" />}
					label="Study pane"
					onSelect={() => chrome.setStudyOpen(!chrome.isStudyOpen)}
				/>
			</RibbonSection>
		</>
	)
}

function LockInReadout() {
	const { endSession, now, pauseSession, resumeSession, session } = useLockIn()
	if (!session) return null

	const isPaused = session.runningSince === null
	return (
		<div className="LockInTimer" role="timer">
			<IconLock aria-hidden="true" size={15} stroke={1.9} />
			<strong>{formatLockInTime(getLockInRemainingMS(session, now))}</strong>
			<span className="LockInTimer-progress" aria-hidden="true">
				<i style={{
					transform: `scaleX(${Math.min(1, getLockInElapsedMS(session, now) / (session.durationMinutes * 60_000))})`,
				}} />
			</span>
			<button
				aria-label={isPaused ? 'Resume Lock In session' : 'Pause Lock In session'}
				onClick={isPaused ? resumeSession : pauseSession}
				title={isPaused ? 'Resume Lock In session' : 'Pause Lock In session'}
				type="button"
			>
				{isPaused
					? <IconPlayerPlay aria-hidden="true" size={15} />
					: <IconPlayerPause aria-hidden="true" size={15} />}
			</button>
			<button
				aria-label="End Lock In session"
				className="LockInTimer-end"
				onClick={endSession}
				title="End Lock In session"
				type="button"
			>
				<IconX aria-hidden="true" size={15} />
			</button>
		</div>
	)
}

interface RibbonItemProps {
	active?: boolean
	danger?: boolean
	disabled?: boolean
	icon: ReactNode
	label: string
	onSelect: () => void
}

/** A full-width menu row: icon, then label. The shape every dropdown action shares. */
function RibbonItem({ active, danger, disabled, icon, label, onSelect }: RibbonItemProps) {
	return (
		<button
			aria-pressed={active}
			className="RibbonMenu-item"
			data-active={active}
			data-danger={danger}
			disabled={disabled}
			onClick={onSelect}
			type="button"
		>
			<span aria-hidden="true" className="RibbonMenu-itemIcon">{icon}</span>
			<span>{label}</span>
		</button>
	)
}

function ToolButton({ icon, id, label }: RibbonTool) {
	const tools = useTools()
	const tool = tools[id]
	const isSelected = useIsToolSelected(tool)
	if (!tool) return null

	return (
		<button
			aria-label={label}
			aria-pressed={isSelected}
			className="Ribbon-tool"
			data-active={isSelected}
			onClick={() => tool.onSelect('toolbar')}
			title={toolTitle(label, tool)}
			type="button"
		>
			{icon}
		</button>
	)
}

/** Every tool the named sections don't cover, kept reachable in the tools menu's last grid. */
function OverflowToolButton({ tool }: { tool: TLUiToolItem }) {
	const editor = useEditor()
	const isSelected = useIsToolSelected(tool)
	// Geo shapes all report the `geo` tool, so the live one is the geo style rather than the id.
	const isGeoSelected = useValue(
		'ribbon geo tool active',
		() => editor.getCurrentToolId() === 'geo' && editor.getStyleForNextShape(GeoShapeGeoStyle) === tool.id,
		[editor, tool.id],
	)
	const label = toolLabel(tool.id)

	return (
		<button
			aria-label={label}
			aria-pressed={isSelected || isGeoSelected}
			className="Ribbon-tool"
			data-active={isSelected || isGeoSelected}
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
