import {
	IconArrowNarrowRight,
	IconArrowsMinimize,
	IconArrowUpLeft,
	IconBrandSpotify,
	IconChevronLeft,
	IconCircle,
	IconEraser,
	IconFileTypePdf,
	IconHandStop,
	IconHighlight,
	IconLetterT,
	IconMathFunction,
	IconMessage,
	IconNote,
	IconPalette,
	IconPencil,
	IconPointer,
	IconSquare,
	IconTools,
	IconX,
} from '@tabler/icons-react'
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import {
	DefaultColorStyle,
	type TLDefaultColorStyle,
	getColorStyleItems,
	getColorValue,
	useEditor,
	useIsToolSelected,
	useTools,
	useValue,
} from 'tldraw'
import { SpotifyPlayer } from '../../spotify/components/SpotifyPlayer'
import {
	RADIAL_MENU_PREFERENCE_EVENT,
	readRadialMenuAlwaysOn,
} from '../lib/radialMenuPreference'
import { useZenMode } from '../lib/ZenModeProvider'

/** A press that holds this long without wandering summons the menu. */
const HOLD_MS = 420
/** Movement beyond this many pixels reads as a drag, so the hold is abandoned. */
const MOVE_TOLERANCE = 10
/** The full two-ring footprint, used to keep expanded menus on-screen. */
const MENU_DIAMETER = 460
const BOX_PAD = 12
/** The root ring's icon and label sit halfway between the center hub and its outer edge. */
const ROOT_CONTENT_RADIUS = 108
/** Expanded choices sit halfway through the second ring. */
const OUTER_CONTENT_RADIUS = 196

interface MenuAction {
	danger?: boolean
	icon: ReactNode
	id: string
	label: string
	onSelect: () => void
}

interface Point {
	x: number
	y: number
}

interface MenuPosition extends Point {
	scale: number
}

type MenuView = 'root' | 'tools' | 'colors'

const TOOL_ACTIONS: { icon: ReactNode; id: string; label: string }[] = [
	{ icon: <IconPointer size={18} stroke={1.7} />, id: 'select', label: 'Select' },
	{ icon: <IconHandStop size={18} stroke={1.7} />, id: 'hand', label: 'Pan' },
	{ icon: <IconPencil size={18} stroke={1.7} />, id: 'draw', label: 'Draw' },
	{ icon: <IconHighlight size={18} stroke={1.7} />, id: 'highlight', label: 'Highlight' },
	{ icon: <IconEraser size={18} stroke={1.7} />, id: 'eraser', label: 'Erase' },
	{ icon: <IconLetterT size={18} stroke={1.7} />, id: 'text', label: 'Text' },
	{ icon: <IconNote size={18} stroke={1.7} />, id: 'note', label: 'Note' },
	{ icon: <IconMathFunction size={18} stroke={1.7} />, id: 'math', label: 'Equation' },
	{ icon: <IconArrowNarrowRight size={18} stroke={1.7} />, id: 'arrow', label: 'Arrow' },
	{ icon: <IconSquare size={18} stroke={1.7} />, id: 'rectangle', label: 'Rectangle' },
	{ icon: <IconCircle size={18} stroke={1.7} />, id: 'ellipse', label: 'Ellipse' },
]

/**
 * Zen Mode's primary affordance, also offered outside Zen behind a setting. Pressing and holding
 * anywhere with a cursor, touch, or pen opens a segmented action ring at that point. Tool and
 * Colour expand into a second ring while other actions run and dismiss. It lives inside tldraw so
 * it can drive the editor, but reads board-wide state to reach chat and PDF controls outside it.
 */
export function ZenRadialMenu() {
	const editor = useEditor()
	const zen = useZenMode()
	const [alwaysOn, setAlwaysOn] = useState(readRadialMenuAlwaysOn)
	const [menu, setMenu] = useState<MenuPosition | null>(null)
	const [view, setView] = useState<MenuView>('root')

	/** The gesture is live in Zen, or anywhere once the user turns the setting on. */
	const active = zen.enabled || alwaysOn

	useEffect(() => {
		const sync = () => setAlwaysOn(readRadialMenuAlwaysOn())
		window.addEventListener('storage', sync)
		window.addEventListener(RADIAL_MENU_PREFERENCE_EVENT, sync)
		return () => {
			window.removeEventListener('storage', sync)
			window.removeEventListener(RADIAL_MENU_PREFERENCE_EVENT, sync)
		}
	}, [])

	function closeMenu() {
		setMenu(null)
		setView('root')
	}

	function openMenu(point: Point) {
		const diameter = Math.min(
			MENU_DIAMETER,
			window.innerWidth - BOX_PAD * 2,
			window.innerHeight - BOX_PAD * 2,
		)
		setView('root')
		setMenu({
			scale: diameter / MENU_DIAMETER,
			x: clamp(point.x - diameter / 2, BOX_PAD, window.innerWidth - diameter - BOX_PAD),
			y: clamp(point.y - diameter / 2, BOX_PAD, window.innerHeight - diameter - BOX_PAD),
		})
	}

	/* Long-press detection. Passive listeners watch every press without stealing short taps or
	   drags from the tools, only committing once the hold survives HOLD_MS in one place. */
	useEffect(() => {
		if (!active) return
		const container = editor.getContainer()
		let timer = 0
		let origin: Point | null = null

		const cancelHold = () => {
			if (timer) window.clearTimeout(timer)
			timer = 0
			origin = null
		}

		const handlePointerDown = (event: PointerEvent) => {
			if (menu || event.button > 0) return
			if ((event.target as Element | null)?.closest('.ZenInteractive')) return
			const point = { x: event.clientX, y: event.clientY }
			origin = point
			timer = window.setTimeout(() => {
				if (!origin) return
				openMenu(point)
				/* Discard anything the hold started — a stray draw dot, a nascent shape. */
				editor.cancel()
				cancelHold()
			}, HOLD_MS)
		}

		const handlePointerMove = (event: PointerEvent) => {
			if (!origin) return
			if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > MOVE_TOLERANCE) {
				cancelHold()
			}
		}

		container.addEventListener('pointerdown', handlePointerDown)
		window.addEventListener('pointermove', handlePointerMove)
		window.addEventListener('pointerup', cancelHold)
		window.addEventListener('pointercancel', cancelHold)
		return () => {
			cancelHold()
			container.removeEventListener('pointerdown', handlePointerDown)
			window.removeEventListener('pointermove', handlePointerMove)
			window.removeEventListener('pointerup', cancelHold)
			window.removeEventListener('pointercancel', cancelHold)
		}
	}, [editor, active, menu])

	/* Escape steps back out: first it closes an open menu, then it leaves Zen — but never while a
	   text field has focus, so typing in the chat pane isn't hijacked. */
	useEffect(() => {
		if (!active) return
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			if (menu) {
				event.stopPropagation()
				event.preventDefault()
				closeMenu()
			} else if (zen.enabled && !isEditableTarget(event.target)) {
				zen.setEnabled(false)
			}
		}
		window.addEventListener('keydown', handleKeyDown, true)
		return () => window.removeEventListener('keydown', handleKeyDown, true)
	}, [zen, active, menu])

	const actions: MenuAction[] = [
		{ icon: <IconTools size={22} stroke={1.65} />, id: 'tools', label: 'Tools', onSelect: () => setView('tools') },
		{ icon: <IconPalette size={22} stroke={1.65} />, id: 'colors', label: 'Colour', onSelect: () => setView('colors') },
		{ icon: <IconMessage size={22} stroke={1.65} />, id: 'chat', label: 'Chat', onSelect: () => { zen.openChat(); closeMenu() } },
		{ icon: <IconFileTypePdf size={22} stroke={1.65} />, id: 'pdf', label: 'PDF', onSelect: () => { zen.importPDF(); closeMenu() } },
		{ icon: <IconBrandSpotify size={22} stroke={1.65} />, id: 'spotify', label: 'Music', onSelect: () => { zen.setSpotifyOpen(!zen.spotifyOpen); closeMenu() } },
	]
	if (zen.enabled) {
		actions.push({ danger: true, icon: <IconArrowsMinimize size={22} stroke={1.65} />, id: 'exit', label: 'Exit Zen', onSelect: () => { zen.setEnabled(false); closeMenu() } })
	}

	const menuStyle = {
		'--zen-menu-scale': menu?.scale ?? 1,
		left: menu?.x,
		top: menu?.y,
	} as CSSProperties

	return (
		<>
			{zen.enabled && zen.spotifyOpen ? (
				<div className="ZenSpotify ZenInteractive">
					<SpotifyPlayer />
				</div>
			) : null}
			{active && menu ? (
				<div className="ZenMenuLayer ZenInteractive">
					<button aria-label="Close menu" className="ZenMenuLayer-scrim" onClick={closeMenu} type="button" />
					<div className="ZenMenu" role="dialog" aria-label="Canvas menu" style={menuStyle}>
						<div className="ZenMenu-stage" data-view={view}>
							<div aria-hidden="true" className="ZenMenu-outerPlate" />
							{view === 'tools' ? (
								<div className="ZenMenu-outerRing" role="group" aria-label="Drawing tools">
									{TOOL_ACTIONS.map((tool, index) => (
										<ToolItem
											index={index}
											key={tool.id}
											count={TOOL_ACTIONS.length}
											icon={tool.icon}
											id={tool.id}
											label={tool.label}
											onSelect={closeMenu}
										/>
									))}
								</div>
							) : null}
							{view === 'colors' ? (
								<div className="ZenMenu-outerRing" role="group" aria-label="Drawing colours">
									<ColorItems onSelect={closeMenu} />
								</div>
							) : null}
							<div aria-hidden="true" className="ZenMenu-rootPlate" />
							<div className="ZenMenu-rootRing" role="group" aria-label="Canvas actions">
								{actions.map((action, index) => (
									<button
										aria-expanded={action.id === 'tools' || action.id === 'colors' ? view === action.id : undefined}
										aria-label={action.label}
										className="ZenMenu-segment ZenMenu-segment--root"
										data-active={view === action.id}
										data-danger={action.danger}
										key={action.id}
										onClick={action.onSelect}
										style={getSegmentStyle(index, actions.length, ROOT_CONTENT_RADIUS, 324)}
										type="button"
									>
										<span className="ZenMenu-segmentContent">
											<span aria-hidden="true" className="ZenMenu-segmentIcon">{action.icon}</span>
											<span className="ZenMenu-segmentLabel">{action.label}</span>
										</span>
									</button>
								))}
							</div>
							<div className="ZenMenu-hub">
								<span className="ZenMenu-title">{view === 'root' ? 'Canvas' : view === 'tools' ? 'Tools' : 'Colour'}</span>
								<div className="ZenMenu-hubControls">
									{view !== 'root' ? (
										<button aria-label="Back to canvas actions" className="ZenMenu-back" onClick={() => setView('root')} type="button">
											<IconChevronLeft size={20} stroke={1.9} />
										</button>
									) : (
										<span aria-hidden="true" className="ZenMenu-origin">
											<IconArrowUpLeft size={18} stroke={1.9} />
										</span>
									)}
									<button aria-label="Close menu" className="ZenMenu-close" onClick={closeMenu} type="button">
										<IconX size={19} stroke={1.9} />
									</button>
								</div>
								<span className="ZenMenu-hint">{view === 'root' ? 'Choose an action' : 'Choose, or go back'}</span>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</>
	)
}

function ToolItem({
	count,
	icon,
	id,
	index,
	label,
	onSelect,
}: {
	count: number
	icon: ReactNode
	id: string
	index: number
	label: string
	onSelect: () => void
}) {
	const tools = useTools()
	const tool = tools[id]
	const isSelected = useIsToolSelected(tool)
	if (!tool) return null

	return (
		<button
			aria-label={label}
			aria-pressed={isSelected}
			className="ZenMenu-segment ZenMenu-segment--outer"
			data-active={isSelected}
			onClick={() => { tool.onSelect('toolbar'); onSelect() }}
			style={getSegmentStyle(index, count, OUTER_CONTENT_RADIUS, MENU_DIAMETER)}
			title={label}
			type="button"
		>
			<span className="ZenMenu-segmentContent">
				<span aria-hidden="true" className="ZenMenu-segmentIcon">{icon}</span>
				<span className="ZenMenu-segmentLabel">{label}</span>
			</span>
		</button>
	)
}

function ColorItems({ onSelect }: { onSelect: () => void }) {
	const editor = useEditor()
	const swatches = useValue(
		'zen colours',
		() => {
			const colors = editor.getCurrentTheme().colors[editor.getColorMode()]
			return getColorStyleItems(colors).map((item) => ({
				fill: getColorValue(colors, item.value, 'solid'),
				value: item.value as TLDefaultColorStyle,
			}))
		},
		[editor],
	)
	const activeColor = useValue('zen active colour', () => editor.getStyleForNextShape(DefaultColorStyle), [editor])

	function pickColor(value: TLDefaultColorStyle) {
		editor.run(() => {
			if (editor.isIn('select')) editor.setStyleForSelectedShapes(DefaultColorStyle, value)
			editor.setStyleForNextShapes(DefaultColorStyle, value)
		})
		onSelect()
	}

	return (
		<>
			{swatches.map((swatch, index) => (
				<button
					aria-label={swatch.value}
					aria-pressed={swatch.value === activeColor}
					className="ZenMenu-segment ZenMenu-segment--outer ZenMenu-swatch"
					data-active={swatch.value === activeColor}
					key={swatch.value}
					onClick={() => pickColor(swatch.value)}
					style={{
						...getSegmentStyle(index, swatches.length, OUTER_CONTENT_RADIUS, MENU_DIAMETER),
						'--swatch': swatch.fill,
					} as CSSProperties}
					title={swatch.value}
					type="button"
				>
					<span className="ZenMenu-segmentContent">
						<span aria-hidden="true" className="ZenMenu-colorDot" />
						<span className="ZenMenu-segmentLabel">{swatch.value}</span>
					</span>
				</button>
			))}
		</>
	)
}

/**
 * Builds one accessible button sector and places its content on the sector's center line.
 * The gray plates below the buttons provide the narrow gutters visible between each segment.
 */
function getSegmentStyle(
	index: number,
	count: number,
	contentRadius: number,
	diameter: number,
): CSSProperties {
	const centerAngle = (index * 360) / count - 90
	const halfAngle = 180 / count - Math.min(2, 80 / count)
	const arcPoints = Array.from({ length: 7 }, (_, pointIndex) => {
		const angle = centerAngle - halfAngle + (halfAngle * 2 * pointIndex) / 6
		const radians = (angle * Math.PI) / 180
		return `${50 + Math.cos(radians) * 49.1}% ${50 + Math.sin(radians) * 49.1}%`
	})
	const contentRadians = (centerAngle * Math.PI) / 180
	const contentOffset = (contentRadius / diameter) * 100

	return {
		'--segment-x': `${50 + Math.cos(contentRadians) * contentOffset}%`,
		'--segment-y': `${50 + Math.sin(contentRadians) * contentOffset}%`,
		clipPath: `polygon(50% 50%, ${arcPoints.join(', ')})`,
	} as CSSProperties
}

function clamp(value: number, min: number, max: number) {
	if (max < min) return (min + max) / 2
	return Math.min(Math.max(value, min), max)
}

function isEditableTarget(target: EventTarget | null) {
	const element = target as HTMLElement | null
	if (!element) return false
	const tag = element.tagName
	return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable
}
