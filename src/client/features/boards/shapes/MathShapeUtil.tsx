import { MATH_SHAPE_TYPE, mathShapeProps, type MathShapeProps } from '@agentboard/shared'
import katex from 'katex'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	resizeBox,
	type TLResizeInfo,
	type TLShape,
	useEditor,
	useIsEditing,
} from 'tldraw'
import { MathField } from './MathField'

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		[MATH_SHAPE_TYPE]: MathShapeProps
	}
}

export type MathShape = TLShape<typeof MATH_SHAPE_TYPE>

const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 160
const PLACEHOLDER_LATEX = '\\square'

export class MathShapeUtil extends BaseBoxShapeUtil<MathShape> {
	static override type = MATH_SHAPE_TYPE
	static override props = mathShapeProps

	override canEdit() {
		return true
	}

	override canResize() {
		return true
	}

	override isAspectRatioLocked() {
		return true
	}

	override getDefaultProps(): MathShape['props'] {
		return { w: 60, h: 48, latex: '', fontSize: 28, schemaVersion: 1 }
	}

	/** The LaTeX is what the tutor reads when it takes context from the canvas. */
	override getText(shape: MathShape) {
		return shape.props.latex
	}

	// Width and height follow the typeset formula, so a resize handle changes the type size
	// instead; the auto-fit below then re-measures the box around the larger formula.
	override onResize(shape: MathShape, info: TLResizeInfo<MathShape>) {
		const box = resizeBox(shape, info)
		const scale = shape.props.w > 0 ? box.props.w / shape.props.w : 1
		return {
			...box,
			props: {
				...box.props,
				fontSize: clamp(shape.props.fontSize * scale, MIN_FONT_SIZE, MAX_FONT_SIZE),
			},
		}
	}

	/** An equation nobody typed anything into is nothing worth keeping on the board. */
	override onEditEnd(shape: MathShape) {
		if (!shape.props.latex.trim()) this.editor.deleteShape(shape.id)
	}

	override component(shape: MathShape) {
		return <MathComponent shape={shape} />
	}

	override getIndicatorPath(shape: MathShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 6)
		return path
	}
}

function MathComponent({ shape }: { shape: MathShape }) {
	const isEditing = useIsEditing(shape.id)
	const measureRef = useAutoFit(shape)
	const markup = useMemo(() => renderLatex(shape.props.latex), [shape.props.latex])

	return (
		<HTMLContainer className="MathShape">
			<div className="MathShape-body" ref={measureRef} style={{ fontSize: shape.props.fontSize }}>
				{isEditing ? (
					<MathField shape={shape} />
				) : (
					<div
						className={shape.props.latex.trim() ? 'MathShape-render' : 'MathShape-render is-empty'}
						dangerouslySetInnerHTML={{ __html: markup }}
					/>
				)}
			</div>
		</HTMLContainer>
	)
}

/**
 * Keeps the shape's box wrapped around the formula. The measured element is positioned out of
 * the container's flow so it takes its natural size rather than the box's current one, which
 * would otherwise pin the formula to whatever width the shape already had.
 */
function useAutoFit(shape: MathShape) {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)

	useLayoutEffect(() => {
		const element = ref.current
		if (!element) return
		const fit = () => {
			// Resizing drives w and h itself; re-measuring mid-gesture fights the drag.
			if (editor.isIn('select.resizing')) return
			const w = Math.max(element.offsetWidth, shape.props.fontSize)
			const h = Math.max(element.offsetHeight, shape.props.fontSize)
			if (Math.abs(w - shape.props.w) <= 1 && Math.abs(h - shape.props.h) <= 1) return
			editor.run(
				() => {
					editor.updateShape({ id: shape.id, type: shape.type, props: { w, h } })
				},
				{ history: 'ignore' }
			)
		}
		fit()
		const observer = new ResizeObserver(fit)
		observer.observe(element)
		return () => observer.disconnect()
	})

	return ref
}

/**
 * Types each line the way the shape will and measures the result. A derivation can then be stacked
 * on creation without a tall line — a nested fraction, a radical — running into the one below it.
 */
export function measureEquationBoxes(lines: readonly string[], fontSize: number) {
	const host = document.createElement('div')
	host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;'
	document.body.appendChild(host)
	try {
		return lines.map((line) => {
			const body = document.createElement('div')
			body.className = 'MathShape-body'
			body.style.fontSize = `${fontSize}px`
			body.innerHTML = `<div class="MathShape-render">${renderLatex(line)}</div>`
			host.appendChild(body)
			return { w: Math.max(body.offsetWidth, fontSize), h: Math.max(body.offsetHeight, fontSize) }
		})
	} finally {
		host.remove()
	}
}

function renderLatex(latex: string) {
	const source = latex.trim() || PLACEHOLDER_LATEX
	try {
		return katex.renderToString(source, {
			displayMode: true,
			errorColor: '#d44c47',
			throwOnError: false,
		})
	} catch {
		// KaTeX still throws past `throwOnError` for a few malformed inputs; showing the raw
		// LaTeX beats blanking the shape out from under whoever is typing.
		return escapeHTML(source)
	}
}

function escapeHTML(value: string) {
	return value.replace(/[&<>]/g, (character) => `&#${character.charCodeAt(0)};`)
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}
