import {
	ArrowShapeArrowheadEndStyle,
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultFontStyle,
	DefaultHorizontalAlignStyle,
	DefaultSizeStyle,
	DefaultTextAlignStyle,
	GeoShapeGeoStyle,
	LineShapeSplineStyle,
	type StyleProp,
	StylePanelArrowKindPicker,
	StylePanelArrowheadPicker,
	StylePanelColorPicker,
	StylePanelContextProvider,
	StylePanelDashPicker,
	StylePanelFillPicker,
	StylePanelFontPicker,
	StylePanelGeoShapePicker,
	StylePanelLabelAlignPicker,
	StylePanelOpacityPicker,
	StylePanelSizePicker,
	StylePanelSplinePicker,
	StylePanelTextAlignPicker,
	getColorStyleItems,
	getColorValue,
	useEditor,
	useRelevantStyles,
	useValue,
} from 'tldraw'
import { RibbonSection } from './RibbonSection'

/**
 * tldraw's own style pickers, split across the bar's two quick-access dropdowns. The pickers are
 * unchanged, so every style — including the ones that only appear for arrows, lines and geo
 * shapes — behaves exactly as it does upstream; only the surface around them moves.
 */
export function CanvasColourControls() {
	const styles = useRelevantStyles()
	if (!styles || styles.get(DefaultColorStyle) === undefined) return <StyleHint />

	return (
		<StylePanelContextProvider styles={styles}>
			<RibbonSection label="Colour">
				<StylePanelColorPicker />
			</RibbonSection>
			<RibbonSection label="Opacity">
				<StylePanelOpacityPicker />
			</RibbonSection>
		</StylePanelContextProvider>
	)
}

export function CanvasStyleControls() {
	const styles = useRelevantStyles()
	if (!styles) return <StyleHint />

	const has = (style: StyleProp<unknown>) => styles.get(style) !== undefined
	const hasStroke = has(DefaultFillStyle) || has(DefaultDashStyle) || has(DefaultSizeStyle)
	const hasText = has(DefaultFontStyle) || has(DefaultTextAlignStyle) || has(DefaultHorizontalAlignStyle)
	const hasShape = has(GeoShapeGeoStyle) || has(ArrowShapeArrowheadEndStyle) || has(LineShapeSplineStyle)
	if (!hasStroke && !hasText && !hasShape) return <StyleHint />

	return (
		<StylePanelContextProvider styles={styles}>
			{hasStroke ? (
				<RibbonSection label="Stroke">
					<StylePanelFillPicker />
					<StylePanelDashPicker />
					<StylePanelSizePicker />
				</RibbonSection>
			) : null}
			{hasText ? (
				<RibbonSection label="Text">
					<StylePanelFontPicker />
					<StylePanelTextAlignPicker />
					<StylePanelLabelAlignPicker />
				</RibbonSection>
			) : null}
			{hasShape ? (
				<RibbonSection label="Shape">
					<StylePanelGeoShapePicker />
					<StylePanelArrowKindPicker />
					<StylePanelArrowheadPicker />
					<StylePanelSplinePicker />
				</RibbonSection>
			) : null}
		</StylePanelContextProvider>
	)
}

/** The colour the next shape will be drawn in, resolved against the canvas theme. */
export function useCurrentColourValue() {
	const editor = useEditor()
	return useValue('ribbon current colour', () => {
		const colors = editor.getCurrentTheme().colors[editor.getColorMode()]
		const active = editor.getStyleForNextShape(DefaultColorStyle)
		const item = getColorStyleItems(colors).find(({ value }) => value === active)
		return item ? getColorValue(colors, item.value, 'solid') : null
	}, [editor])
}

function StyleHint() {
	return <p className="RibbonMenu-hint">Pick a tool or select a shape to style it.</p>
}
