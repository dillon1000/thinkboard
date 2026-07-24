import { MATH_SHAPE_TYPE } from '@agentboard/shared'
import type { MathfieldElement } from 'mathlive'
import { useEffect, useRef } from 'react'
import { useEditor } from 'tldraw'
import type { MathShape } from './MathShapeUtil'

/**
 * MathLive's mathfield, mounted imperatively so its custom element never has to round-trip
 * through React. The library is ~5MB with its keyboard and compute engine, so it is imported
 * on first use rather than with the board — the field appears a beat after the shape does.
 */
export function MathField({ shape }: { shape: MathShape }) {
	const editor = useEditor()
	const hostRef = useRef<HTMLDivElement>(null)
	const fieldRef = useRef<MathfieldElement | null>(null)
	// Read inside listeners that outlive the render they were created in.
	const shapeRef = useRef(shape)
	shapeRef.current = shape

	useEffect(() => {
		let cancelled = false

		void import('mathlive').then(({ MathfieldElement }) => {
			const host = hostRef.current
			if (cancelled || !host) return

			// Both are served from our own bundle: KaTeX's stylesheet already carries the fonts,
			// and typing feedback sounds would be a strange thing for a whiteboard to make.
			MathfieldElement.fontsDirectory = null
			MathfieldElement.soundsDirectory = null

			const field = new MathfieldElement()
			field.value = shapeRef.current.props.latex
			// Lets "sin", "if x > 0" and friends fall into the right mode as they are typed.
			field.smartMode = true
			field.mathVirtualKeyboardPolicy = 'auto'
			field.style.fontSize = 'inherit'

			field.addEventListener('input', () => {
				editor.updateShape<MathShape>({
					id: shapeRef.current.id,
					type: MATH_SHAPE_TYPE,
					props: { latex: field.value },
				})
			})

			// tldraw binds single-key shortcuts on the document, so every keystroke that lands in
			// the field has to stop there or typing "d" would swap the canvas over to the draw tool.
			field.addEventListener('keydown', (event) => {
				event.stopPropagation()
				if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
					event.preventDefault()
					editor.setEditingShape(null)
					editor.setCurrentTool('select')
				}
			})
			field.addEventListener('keyup', (event) => event.stopPropagation())

			host.appendChild(field)
			fieldRef.current = field
			field.focus()

			// The double-click that opened the shape reaches the field too, and MathLive reads it as
			// select-all — one keystroke from wiping the formula. Land the caret at the end instead,
			// after that click has been handled.
			requestAnimationFrame(() => field.executeCommand('moveToMathfieldEnd'))
		})

		return () => {
			cancelled = true
			fieldRef.current?.remove()
			fieldRef.current = null
		}
	}, [editor])

	// Catches edits arriving from another person on the board mid-typing. Skipped when the value
	// already matches, so our own keystrokes never move the caret back to the end.
	useEffect(() => {
		const field = fieldRef.current
		if (field && field.value !== shape.props.latex) field.value = shape.props.latex
	}, [shape.props.latex])

	return <div className="MathShape-field" ref={hostRef} />
}
