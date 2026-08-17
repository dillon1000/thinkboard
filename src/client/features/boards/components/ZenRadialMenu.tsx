import {
	apiRoutes,
	type SpotifyPlaybackAction,
} from '@agentboard/shared'
import {
	IconAdjustmentsHorizontal,
	IconArrowBackUp,
	IconArrowForwardUp,
	IconArrowNarrowRight,
	IconArrowsMinimize,
	IconBolt,
	IconBrandSpotify,
	IconBrush,
	IconChevronLeft,
	IconCircle,
	IconCopy,
	IconDropletHalf2,
	IconEraser,
	IconFileTypePdf,
	IconHandStop,
	IconHighlight,
	IconLetterT,
	IconLineDashed,
	IconMathFunction,
	IconMessage,
	IconMessageQuestion,
	IconNote,
	IconPalette,
	IconPencil,
	IconPlayerPauseFilled,
	IconPlayerPlayFilled,
	IconPlayerSkipBackFilled,
	IconPlayerSkipForwardFilled,
	IconPointer,
	IconQuestionMark,
	IconSquare,
	IconTools,
	IconTrash,
	IconX,
} from '@tabler/icons-react'
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { z } from 'zod'
import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	type TLDefaultColorStyle,
	type TLDefaultDashStyle,
	type TLDefaultFillStyle,
	type TLDefaultSizeStyle,
	getColorStyleItems,
	getColorValue,
	useEditor,
	useIsToolSelected,
	useTools,
	useValue,
} from 'tldraw'
import { apiRequest } from '../../../lib/api'
import { cssVariables, type CSSVariableStyle } from '../../../lib/styleTypes'
import { requestZenChatPrompt } from '../../study/lib/zenChatPrompt'
import {
	RADIAL_BIND_ACTIONS,
	type RadialBindAction,
	readRadialMenuBindings,
	writeRadialMenuBindings,
} from '../lib/radialMenuBindings'
import {
	RADIAL_MENU_PREFERENCE_EVENT,
	readRadialMenuAlwaysOn,
} from '../lib/radialMenuPreference'
import { useZenMode } from '../lib/ZenModeProvider'

/** A press that holds this long without wandering summons the menu. */
const HOLD_MS = 420
/** Movement beyond this many pixels reads as a drag, so the hold is abandoned. */
const MOVE_TOLERANCE = 10
/** The complete menu footprint, including the outer shortcut buttons. */
const MENU_DIAMETER = 520
const BOX_PAD = 12
/** Keeps a 13px visual gap between the 94px hub and each 108px root petal. */
const PETAL_RADIUS = 114
const FAN_RADIUS = 226

interface Point {
	x: number
	y: number
}

interface MenuPosition extends Point {
	scale: number
}

interface FanAction {
	active?: boolean
	danger?: boolean
	disabled?: boolean
	icon: ReactNode
	id: string
	label: string
	onSelect: () => void
	swatch?: string
}

type FanID =
	| 'bind-0'
	| 'bind-1'
	| 'bind-2'
	| 'chat'
	| 'colors'
	| 'fill'
	| 'music'
	| 'opacity'
	| 'size'
	| 'stroke'
	| 'style'
	| 'tools'

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

const FAN_TITLES = {
	'bind-0': 'Bind 1',
	'bind-1': 'Bind 2',
	'bind-2': 'Bind 3',
	chat: 'Zen chat',
	colors: 'Colour',
	fill: 'Fill',
	music: 'Music',
	opacity: 'Opacity',
	size: 'Size',
	stroke: 'Stroke',
	style: 'Style',
	tools: 'Tools',
} satisfies Record<FanID, string>

const STYLE_FANS: FanID[] = ['colors', 'stroke', 'fill', 'size', 'opacity']

/**
 * Zen Mode's main canvas control. A hold opens eight separately spaced petals. Hovering a petal
 * reveals only its local fan, which keeps dense tool and media controls away from unrelated actions.
 */
export function ZenRadialMenu() {
	const editor = useEditor()
	const zen = useZenMode()
	const tools = useTools()
	const [alwaysOn, setAlwaysOn] = useState(readRadialMenuAlwaysOn)
	const [bindings, setBindings] = useState(readRadialMenuBindings)
	const [menu, setMenu] = useState<MenuPosition | null>(null)
	const [fan, setFan] = useState<FanID | null>(null)
	const [musicPlaying, setMusicPlaying] = useState(false)
	const [musicBusy, setMusicBusy] = useState(false)
	const [status, setStatus] = useState<string | null>(null)

	const active = zen.enabled || alwaysOn
	const selectedCount = useValue(
		'zen selected shape count',
		() => editor.getSelectedShapeIds().length,
		[editor],
	)
	const canUndo = useValue('zen can undo', () => editor.getCanUndo(), [editor])
	const canRedo = useValue('zen can redo', () => editor.getCanRedo(), [editor])
	const activeDash = useValue(
		'zen active dash',
		() => editor.getStyleForNextShape(DefaultDashStyle),
		[editor],
	)
	const activeFill = useValue(
		'zen active fill',
		() => editor.getStyleForNextShape(DefaultFillStyle),
		[editor],
	)
	const activeSize = useValue(
		'zen active size',
		() => editor.getStyleForNextShape(DefaultSizeStyle),
		[editor],
	)
	const activeOpacity = useValue('zen active opacity', () => {
		const opacity = editor.getSharedOpacity()
		return opacity.type === 'shared' ? opacity.value : null
	}, [editor])

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
		setFan(null)
		setStatus(null)
	}

	function openMenu(point: Point) {
		const diameter = Math.min(
			MENU_DIAMETER,
			window.innerWidth - BOX_PAD * 2,
			window.innerHeight - BOX_PAD * 2,
		)
		setFan(null)
		setStatus(null)
		setMenu({
			scale: diameter / MENU_DIAMETER,
			x: clamp(point.x - diameter / 2, BOX_PAD, window.innerWidth - diameter - BOX_PAD),
			y: clamp(point.y - diameter / 2, BOX_PAD, window.innerHeight - diameter - BOX_PAD),
		})
	}

	/* Passive listeners preserve normal short taps and drags. The menu commits only after one
	   stationary pointer survives the hold interval, then cancels any shape that hold started. */
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
			if (event.target instanceof Element && event.target.closest('.ZenInteractive')) return
			const point = { x: event.clientX, y: event.clientY }
			origin = point
			timer = window.setTimeout(() => {
				if (!origin) return
				openMenu(point)
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

	/* Escape closes an open radial first and leaves Zen on the next press. Text entry keeps Escape. */
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

	function askChat(prompt: string) {
		requestZenChatPrompt(prompt)
		zen.openChat()
		closeMenu()
	}

	async function sendMusicAction(action: SpotifyPlaybackAction, dismiss = false) {
		if (musicBusy) return
		setMusicBusy(true)
		setStatus(null)
		try {
			await apiRequest(apiRoutes.spotifyPlayer, {
				body: JSON.stringify({ action }),
				method: 'POST',
			}, z.object({ ok: z.literal(true) }))
			if (action === 'play' || action === 'pause') setMusicPlaying(action === 'play')
			if (dismiss) closeMenu()
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Spotify is unavailable')
		} finally {
			setMusicBusy(false)
		}
	}

	function applyColor(value: TLDefaultColorStyle) {
		editor.run(() => {
			if (selectedCount) editor.setStyleForSelectedShapes(DefaultColorStyle, value)
			editor.setStyleForNextShapes(DefaultColorStyle, value)
		})
	}

	function applyDash(value: TLDefaultDashStyle) {
		editor.run(() => {
			if (selectedCount) editor.setStyleForSelectedShapes(DefaultDashStyle, value)
			editor.setStyleForNextShapes(DefaultDashStyle, value)
		})
	}

	function applyFill(value: TLDefaultFillStyle) {
		editor.run(() => {
			if (selectedCount) editor.setStyleForSelectedShapes(DefaultFillStyle, value)
			editor.setStyleForNextShapes(DefaultFillStyle, value)
		})
	}

	function applySize(value: TLDefaultSizeStyle) {
		editor.run(() => {
			if (selectedCount) editor.setStyleForSelectedShapes(DefaultSizeStyle, value)
			editor.setStyleForNextShapes(DefaultSizeStyle, value)
		})
	}

	function applyOpacity(value: number) {
		editor.run(() => {
			if (selectedCount) editor.setOpacityForSelectedShapes(value)
			editor.setOpacityForNextShapes(value)
		})
	}

	function configureBinding(index: number, action: RadialBindAction) {
		const next = bindings.map((binding, slot) => slot === index ? action : binding)
		setBindings(next)
		writeRadialMenuBindings(next)
		setStatus(`Bind ${index + 1}: ${getBindLabel(action)}`)
	}

	function executeBinding(action: RadialBindAction) {
		switch (action) {
			case 'blue-pen':
				applyColor('blue')
				tools.draw?.onSelect('toolbar')
				closeMenu()
				return
			case 'red-highlighter':
				applyColor('red')
				tools.highlight?.onSelect('toolbar')
				closeMenu()
				return
			case 'next-track':
				void sendMusicAction('next', true)
				return
			case 'ask-selection':
				askChat('Check my selected work and tell me what I misunderstood.')
				return
			case 'delete-selection':
				if (selectedCount) editor.deleteShapes(editor.getSelectedShapes())
				closeMenu()
				return
			case 'none':
				return
		}
	}

	const rootActions = [
		{
			fan: 'tools' as const,
			icon: <IconTools size={22} stroke={1.7} />,
			id: 'tools',
			label: 'Tools',
		},
		{
			fan: 'style' as const,
			icon: <IconAdjustmentsHorizontal size={22} stroke={1.7} />,
			id: 'style',
			label: 'Style',
		},
		{
			fan: 'chat' as const,
			icon: <IconMessage size={22} stroke={1.7} />,
			id: 'chat',
			label: 'Chat',
		},
		{
			fan: 'music' as const,
			icon: <IconBrandSpotify size={22} stroke={1.7} />,
			id: 'music',
			label: 'Music',
		},
		{
			icon: <IconFileTypePdf size={22} stroke={1.7} />,
			id: 'pdf',
			label: 'PDF',
			onSelect: () => {
				zen.importPDF()
				closeMenu()
			},
		},
		{
			danger: true,
			disabled: !selectedCount,
			icon: <IconTrash size={22} stroke={1.7} />,
			id: 'delete',
			label: 'Delete',
			onSelect: () => {
				editor.deleteShapes(editor.getSelectedShapes())
				closeMenu()
			},
		},
		{
			icon: <IconArrowsMinimize size={22} stroke={1.7} />,
			id: 'zen',
			label: zen.enabled ? 'Exit Zen' : 'Enter Zen',
			onSelect: () => {
				zen.setEnabled(!zen.enabled)
				closeMenu()
			},
		},
		{
			icon: <IconPointer size={22} stroke={1.7} />,
			id: 'select',
			label: 'Select',
			onSelect: () => {
				tools.select?.onSelect('toolbar')
				closeMenu()
			},
		},
	]

	const fanActions = getFanActions({
		activeDash,
		activeFill,
		activeOpacity,
		activeSize,
		applyDash,
		applyFill,
		applyOpacity,
		applySize,
		askChat,
		configureBinding,
		fan,
		musicBusy,
		musicPlaying,
		sendMusicAction,
		setFan,
		zenOpenChat: () => {
			zen.openChat()
			closeMenu()
		},
	})

	const menuStyle = {
		'--zen-menu-scale': menu?.scale ?? 1,
		left: menu?.x,
		top: menu?.y,
	} satisfies CSSVariableStyle

	return active && menu ? (
		<div className="ZenMenuLayer ZenInteractive">
			<button aria-label="Close menu" className="ZenMenuLayer-scrim" onClick={closeMenu} type="button" />
			<div className="ZenMenu" role="dialog" aria-label="Canvas menu" style={menuStyle}>
				<div className="ZenMenu-stage" data-fan={fan ?? 'none'}>
					{fan === 'tools' ? <ToolFan onSelect={closeMenu} /> : null}
					{fan === 'colors' ? <ColorFan applyColor={applyColor} onSelect={() => setFan('style')} /> : null}
					{fan && fan !== 'tools' && fan !== 'colors' && fanActions ? (
						<FanMenu
							actions={fanActions.actions}
							centerAngle={fanActions.centerAngle}
							spread={fanActions.spread}
						/>
					) : null}

					<div className="ZenMenu-petals" role="group" aria-label="Canvas actions">
						{rootActions.map((action, index) => {
							const angle = index * 45 - 90
							const isOpen = Boolean(action.fan && (
								action.fan === fan ||
								(action.fan === 'style' && fan && STYLE_FANS.includes(fan))
							))
							return (
								<button
									aria-expanded={action.fan ? isOpen : undefined}
									aria-label={action.label}
									className="ZenMenu-petal"
									data-active={isOpen}
									data-danger={action.danger}
									disabled={action.disabled}
									key={action.id}
									onClick={() => action.fan ? setFan(action.fan) : action.onSelect?.()}
									onFocus={() => action.fan && setFan(action.fan)}
									onPointerEnter={() => action.fan ? setFan(action.fan) : setFan(null)}
									style={getPetalStyle(angle)}
									type="button"
								>
									<span className="ZenMenu-petalContent">
										<span aria-hidden="true">{action.icon}</span>
										<span>{action.label}</span>
									</span>
								</button>
							)
						})}
					</div>

					<Satellite
						angle={-160}
						disabled={!canUndo}
						icon={<IconArrowBackUp size={19} stroke={1.8} />}
						label="Undo"
						onSelect={() => {
							editor.undo()
							closeMenu()
						}}
					/>
					<Satellite
						angle={-112}
						disabled={!canRedo}
						icon={<IconArrowForwardUp size={19} stroke={1.8} />}
						label="Redo"
						onSelect={() => {
							editor.redo()
							closeMenu()
						}}
					/>
					<Satellite
						angle={-34}
						disabled={!selectedCount}
						icon={<IconCopy size={19} stroke={1.8} />}
						label="Duplicate"
						onSelect={() => {
							editor.duplicateShapes(editor.getSelectedShapes(), { x: 8, y: 8 })
							closeMenu()
						}}
					/>
					{bindings.map((binding, index) => (
						<Satellite
							active={fan === `bind-${index}`}
							angle={[145, 90, 35][index]}
							icon={<IconBolt size={18} stroke={1.8} />}
							key={index}
							label={`Bind ${index + 1}: ${getBindLabel(binding)}`}
							onHover={() => setFan(getBindFanID(index))}
							onSelect={() => binding === 'none'
								? setFan(getBindFanID(index))
								: executeBinding(binding)}
							shortLabel={`B${index + 1}`}
						/>
					))}

					<div className="ZenMenu-hub">
						<span className="ZenMenu-title">{fan ? FAN_TITLES[fan] : 'Canvas'}</span>
						<div className="ZenMenu-hubControls">
							{fan ? (
								<button
									aria-label="Back"
									className="ZenMenu-back"
									onClick={() => setFan(STYLE_FANS.includes(fan) ? 'style' : null)}
									type="button"
								>
									<IconChevronLeft size={20} stroke={1.9} />
								</button>
							) : (
								<span aria-hidden="true" className="ZenMenu-origin">
									<IconBolt size={17} stroke={1.8} />
								</span>
							)}
							<button aria-label="Close menu" className="ZenMenu-close" onClick={closeMenu} type="button">
								<IconX size={19} stroke={1.9} />
							</button>
						</div>
						<span className="ZenMenu-hint">
							{status ?? (fan ? 'Choose an option' : 'Hover to fan out')}
						</span>
					</div>
				</div>
			</div>
		</div>
	) : null
}

function ToolFan({ onSelect }: { onSelect: () => void }) {
	const tools = useTools()
	return (
		<div className="ZenMenu-fan" role="group" aria-label="Drawing tools">
			{TOOL_ACTIONS.map((tool, index) => (
				<ToolFanItem
					count={TOOL_ACTIONS.length}
					icon={tool.icon}
					index={index}
					key={tool.id}
					label={tool.label}
					onSelect={onSelect}
					tool={tools[tool.id]}
				/>
			))}
		</div>
	)
}

function ToolFanItem({
	count,
	icon,
	index,
	label,
	onSelect,
	tool,
}: {
	count: number
	icon: ReactNode
	index: number
	label: string
	onSelect: () => void
	tool: ReturnType<typeof useTools>[string]
}) {
	const isSelected = useIsToolSelected(tool)
	if (!tool) return null
	return (
		<button
			aria-label={label}
			aria-pressed={isSelected}
			className="ZenMenu-fanButton"
			data-active={isSelected}
			onClick={() => {
				tool.onSelect('toolbar')
				onSelect()
			}}
			style={getFanStyle(index, count, -90, 200)}
			type="button"
		>
			<span aria-hidden="true">{icon}</span>
			<span>{label}</span>
		</button>
	)
}

function ColorFan({
	applyColor,
	onSelect,
}: {
	applyColor: (value: TLDefaultColorStyle) => void
	onSelect: () => void
}) {
	const editor = useEditor()
	const swatches = useValue('zen colours', () => {
		const colors = editor.getCurrentTheme().colors[editor.getColorMode()]
		return getColorStyleItems(colors).map((item) => ({
			fill: getColorValue(colors, item.value, 'solid'),
			value: DefaultColorStyle.validate(item.value),
		}))
	}, [editor])
	const activeColor = useValue(
		'zen active colour',
		() => editor.getStyleForNextShape(DefaultColorStyle),
		[editor],
	)

	return (
		<div className="ZenMenu-fan" role="group" aria-label="Drawing colours">
			{swatches.map((swatch, index) => (
				<button
					aria-label={swatch.value}
					aria-pressed={swatch.value === activeColor}
					className="ZenMenu-fanButton ZenMenu-fanButton--swatch"
					data-active={swatch.value === activeColor}
					key={swatch.value}
					onClick={() => {
						applyColor(swatch.value)
						onSelect()
					}}
					style={cssVariables({
						...getFanStyle(index, swatches.length, -45, 210),
						'--swatch': swatch.fill,
					})}
					type="button"
				>
					<span aria-hidden="true" className="ZenMenu-colorDot" />
					<span>{swatch.value}</span>
				</button>
			))}
		</div>
	)
}

function FanMenu({
	actions,
	centerAngle,
	spread,
}: {
	actions: FanAction[]
	centerAngle: number
	spread: number
}) {
	return (
		<div className="ZenMenu-fan" role="group" aria-label="Quick actions">
			{actions.map((action, index) => {
				const style: CSSProperties & { '--swatch'?: string } = getFanStyle(
					index,
					actions.length,
					centerAngle,
					spread
				)
				if (action.swatch) style['--swatch'] = action.swatch
				return (
				<button
					aria-label={action.label}
					aria-pressed={action.active}
					className="ZenMenu-fanButton"
					data-active={action.active}
					data-danger={action.danger}
					disabled={action.disabled}
					key={action.id}
					onClick={action.onSelect}
					style={style}
					type="button"
				>
					<span aria-hidden="true">{action.swatch
						? <span className="ZenMenu-colorDot" />
						: action.icon}</span>
					<span>{action.label}</span>
				</button>
				)
			})}
		</div>
	)
}

function Satellite({
	active,
	angle,
	disabled,
	icon,
	label,
	onHover,
	onSelect,
	shortLabel,
}: {
	active?: boolean
	angle: number
	disabled?: boolean
	icon: ReactNode
	label: string
	onHover?: () => void
	onSelect: () => void
	shortLabel?: string
}) {
	return (
		<button
			aria-label={label}
			className="ZenMenu-satellite"
			data-active={active}
			disabled={disabled}
			onClick={onSelect}
			onFocus={onHover}
			onPointerEnter={onHover}
			style={getPolarStyle(angle, 236)}
			title={label}
			type="button"
		>
			<span aria-hidden="true">{icon}</span>
			<span>{shortLabel ?? label}</span>
		</button>
	)
}

function getFanActions({
	activeDash,
	activeFill,
	activeOpacity,
	activeSize,
	applyDash,
	applyFill,
	applyOpacity,
	applySize,
	askChat,
	configureBinding,
	fan,
	musicBusy,
	musicPlaying,
	sendMusicAction,
	setFan,
	zenOpenChat,
}: {
	activeDash: TLDefaultDashStyle
	activeFill: TLDefaultFillStyle
	activeOpacity: number | null
	activeSize: TLDefaultSizeStyle
	applyDash: (value: TLDefaultDashStyle) => void
	applyFill: (value: TLDefaultFillStyle) => void
	applyOpacity: (value: number) => void
	applySize: (value: TLDefaultSizeStyle) => void
	askChat: (prompt: string) => void
	configureBinding: (index: number, action: RadialBindAction) => void
	fan: FanID | null
	musicBusy: boolean
	musicPlaying: boolean
	sendMusicAction: (action: SpotifyPlaybackAction) => Promise<void>
	setFan: (fan: FanID) => void
	zenOpenChat: () => void
}): { actions: FanAction[]; centerAngle: number; spread: number } | null {
	if (!fan) return null
	if (fan.startsWith('bind-')) {
		const slot = Number(fan.slice(-1))
		return {
			actions: RADIAL_BIND_ACTIONS.map((action) => ({
				icon: getBindIcon(action),
				id: action,
				label: getBindLabel(action),
				onSelect: () => configureBinding(slot, action),
			})),
			centerAngle: -90,
			spread: 138,
		}
	}
	if (fan === 'style') {
		return {
			actions: [
				{ icon: <IconPalette size={19} />, id: 'colors', label: 'Colour', onSelect: () => setFan('colors') },
				{ icon: <IconLineDashed size={19} />, id: 'stroke', label: 'Stroke', onSelect: () => setFan('stroke') },
				{ icon: <IconDropletHalf2 size={19} />, id: 'fill', label: 'Fill', onSelect: () => setFan('fill') },
				{ icon: <IconCircle size={19} />, id: 'size', label: 'Size', onSelect: () => setFan('size') },
				{ icon: <IconBrush size={19} />, id: 'opacity', label: 'Opacity', onSelect: () => setFan('opacity') },
			],
			centerAngle: -45,
			spread: 104,
		}
	}
	if (fan === 'stroke') {
		const options: { label: string; value: TLDefaultDashStyle }[] = [
			{ label: 'Solid', value: 'solid' },
			{ label: 'Drawn', value: 'draw' },
			{ label: 'Dashed', value: 'dashed' },
			{ label: 'Dotted', value: 'dotted' },
		]
		return {
			actions: options.map(({ label, value }) => ({
				active: activeDash === value,
				icon: <IconLineDashed size={19} />,
				id: value,
				label,
				onSelect: () => applyDash(value),
			})),
			centerAngle: -45,
			spread: 88,
		}
	}
	if (fan === 'fill') {
		const options: { label: string; value: TLDefaultFillStyle }[] = [
			{ label: 'None', value: 'none' },
			{ label: 'Light', value: 'semi' },
			{ label: 'Solid', value: 'solid' },
			{ label: 'Pattern', value: 'pattern' },
		]
		return {
			actions: options.map(({ label, value }) => ({
				active: activeFill === value,
				icon: <IconDropletHalf2 size={19} />,
				id: value,
				label,
				onSelect: () => applyFill(value),
			})),
			centerAngle: -45,
			spread: 88,
		}
	}
	if (fan === 'size') {
		const options: { label: string; value: TLDefaultSizeStyle }[] = [
			{ label: 'Small', value: 's' },
			{ label: 'Medium', value: 'm' },
			{ label: 'Large', value: 'l' },
			{ label: 'XL', value: 'xl' },
		]
		return {
			actions: options.map(({ label, value }, index) => ({
				active: activeSize === value,
				icon: <IconCircle size={13 + index * 2} />,
				id: value,
				label,
				onSelect: () => applySize(value),
			})),
			centerAngle: -45,
			spread: 88,
		}
	}
	if (fan === 'opacity') {
		const options = [1, 0.75, 0.5, 0.25]
		return {
			actions: options.map((value) => ({
				active: activeOpacity === value,
				icon: <IconCircle fill="currentColor" opacity={value} size={19} />,
				id: String(value),
				label: `${value * 100}%`,
				onSelect: () => applyOpacity(value),
			})),
			centerAngle: -45,
			spread: 88,
		}
	}
	if (fan === 'chat') {
		return {
			actions: [
				{
					icon: <IconMessageQuestion size={19} />,
					id: 'ask-selection',
					label: 'Ask selection',
					onSelect: () => askChat('Check my selected work and tell me what I misunderstood.'),
				},
				{
					icon: <IconQuestionMark size={19} />,
					id: 'explain',
					label: 'Explain',
					onSelect: () => askChat('Explain the selected material in plain language.'),
				},
				{
					icon: <IconBolt size={19} />,
					id: 'quiz',
					label: 'Quiz me',
					onSelect: () => askChat('Make a short quiz from the selected material.'),
				},
				{
					icon: <IconMessage size={19} />,
					id: 'open-chat',
					label: 'Open chat',
					onSelect: zenOpenChat,
				},
			],
			centerAngle: 0,
			spread: 86,
		}
	}
	if (fan === 'music') {
		return {
			actions: [
				{
					disabled: musicBusy,
					icon: <IconPlayerSkipBackFilled size={19} />,
					id: 'previous',
					label: 'Previous',
					onSelect: () => void sendMusicAction('previous'),
				},
				{
					disabled: musicBusy,
					icon: musicPlaying
						? <IconPlayerPauseFilled size={19} />
						: <IconPlayerPlayFilled size={19} />,
					id: 'play-pause',
					label: musicPlaying ? 'Pause' : 'Play',
					onSelect: () => void sendMusicAction(musicPlaying ? 'pause' : 'play'),
				},
				{
					disabled: musicBusy,
					icon: <IconPlayerSkipForwardFilled size={19} />,
					id: 'next',
					label: 'Next',
					onSelect: () => void sendMusicAction('next'),
				},
			],
			centerAngle: 45,
			spread: 70,
		}
	}
	return null
}

function getBindLabel(action: RadialBindAction) {
	switch (action) {
		case 'blue-pen': return 'Blue pen'
		case 'red-highlighter': return 'Red highlight'
		case 'next-track': return 'Next track'
		case 'ask-selection': return 'Ask selection'
		case 'delete-selection': return 'Delete'
		case 'none': return 'Do nothing'
	}
}

function getBindIcon(action: RadialBindAction) {
	switch (action) {
		case 'blue-pen': return <IconPencil size={19} />
		case 'red-highlighter': return <IconHighlight size={19} />
		case 'next-track': return <IconPlayerSkipForwardFilled size={19} />
		case 'ask-selection': return <IconMessageQuestion size={19} />
		case 'delete-selection': return <IconTrash size={19} />
		case 'none': return <IconX size={19} />
	}
}

/** Places every main action at the same radius and rotates the petal back toward the center. */
function getPetalStyle(angle: number): CSSVariableStyle {
	return {
		...getPolarStyle(angle, PETAL_RADIUS),
		'--petal-rotation': `${angle + 90}deg`,
	}
}

function getFanStyle(
	index: number,
	count: number,
	centerAngle: number,
	spread: number,
): CSSVariableStyle {
	const angle = count === 1
		? centerAngle
		: centerAngle - spread / 2 + (spread * index) / (count - 1)
	return {
		...getPolarStyle(angle, FAN_RADIUS),
		'--fan-delay': `${Math.min(index * 12, 96)}ms`,
	}
}

function getPolarStyle(angle: number, radius: number): CSSProperties {
	const radians = (angle * Math.PI) / 180
	return {
		left: `calc(50% + ${Math.cos(radians) * radius}px)`,
		top: `calc(50% + ${Math.sin(radians) * radius}px)`,
	}
}

function clamp(value: number, min: number, max: number) {
	if (max < min) return (min + max) / 2
	return Math.min(Math.max(value, min), max)
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false
	const element = target
	const tag = element.tagName
	return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable
}

function getBindFanID(index: number): FanID {
	return z.enum(['bind-0', 'bind-1', 'bind-2']).parse(`bind-${index}`)
}
