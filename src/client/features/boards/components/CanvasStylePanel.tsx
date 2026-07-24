import { type ReactNode, useRef } from 'react'
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
	type TLUiStylePanelProps,
	usePassThroughWheelEvents,
	useRelevantStyles,
} from 'tldraw'
import { useLockIn } from '../../lock-in/LockInProvider'

/**
 * tldraw's pickers, recomposed into named sections. The pickers themselves are tldraw's own,
 * so every style — including the ones that only appear for arrows, lines and geo shapes —
 * behaves exactly as it does upstream; what changes is the panel around them.
 */
export function CanvasStylePanel({ isMobile, styles: providedStyles }: TLUiStylePanelProps) {
	const ref = useRef<HTMLDivElement>(null)
	const { session } = useLockIn()
	usePassThroughWheelEvents(ref)
	const relevantStyles = useRelevantStyles()
	const styles = providedStyles ?? relevantStyles

	if (!styles || session) return null

	const has = (style: StyleProp<unknown>) => styles.get(style) !== undefined

	return (
		<div className="CanvasStylePanel" data-mobile={isMobile} ref={ref}>
			<StylePanelContextProvider styles={styles}>
				<StyleSection label="Color" show={has(DefaultColorStyle)}>
					<StylePanelColorPicker />
					<StylePanelOpacityPicker />
				</StyleSection>
				<StyleSection label="Stroke" show={has(DefaultFillStyle) || has(DefaultDashStyle) || has(DefaultSizeStyle)}>
					<StylePanelFillPicker />
					<StylePanelDashPicker />
					<StylePanelSizePicker />
				</StyleSection>
				<StyleSection label="Text" show={has(DefaultFontStyle) || has(DefaultTextAlignStyle) || has(DefaultHorizontalAlignStyle)}>
					<StylePanelFontPicker />
					<StylePanelTextAlignPicker />
					<StylePanelLabelAlignPicker />
				</StyleSection>
				<StyleSection label="Shape" show={has(GeoShapeGeoStyle) || has(ArrowShapeArrowheadEndStyle) || has(LineShapeSplineStyle)}>
					<StylePanelGeoShapePicker />
					<StylePanelArrowKindPicker />
					<StylePanelArrowheadPicker />
					<StylePanelSplinePicker />
				</StyleSection>
			</StylePanelContextProvider>
		</div>
	)
}

interface StyleSectionProps {
	children: ReactNode
	label: string
	show: boolean
}

function StyleSection({ children, label, show }: StyleSectionProps) {
	if (!show) return null

	return (
		<section className="CanvasStyleSection">
			<p className="CanvasStyleSection-label">{label}</p>
			{children}
		</section>
	)
}
