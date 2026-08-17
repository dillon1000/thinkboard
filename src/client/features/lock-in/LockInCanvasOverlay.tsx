import { isShapeId, useEditor, useValue } from 'tldraw'
import { useLockIn } from './LockInProvider'

interface ScreenRect {
	height: number
	left: number
	top: number
	width: number
}

export function LockInCanvasOverlay() {
	const editor = useEditor()
	const { session } = useLockIn()
	const scopeKey = session?.scopeShapeIDs.join('|') ?? ''
	const scopeRect = useValue<ScreenRect | null>(
		'lock in focus scope',
		() => getScopeScreenRect(editor, session?.scopeShapeIDs ?? []),
		[editor, scopeKey],
	)

	if (!session) return null

	return (
		<div className="LockInCanvasOverlay" data-has-scope={Boolean(scopeRect)}>
			{scopeRect ? (
				<>
					<div className="LockInMask LockInMask--top" style={{ height: scopeRect.top }} />
					<div className="LockInMask LockInMask--right" style={{ left: scopeRect.left + scopeRect.width, top: scopeRect.top, height: scopeRect.height }} />
					<div className="LockInMask LockInMask--bottom" style={{ top: scopeRect.top + scopeRect.height }} />
					<div className="LockInMask LockInMask--left" style={{ top: scopeRect.top, width: scopeRect.left, height: scopeRect.height }} />
					<div
						className="LockInScope"
						style={{
							height: scopeRect.height,
							left: scopeRect.left,
							top: scopeRect.top,
							width: scopeRect.width,
						}}
					>
						<span>{session.scopeShapeIDs.length} objects in focus</span>
					</div>
				</>
			) : null}
		</div>
	)
}

function getScopeScreenRect(editor: ReturnType<typeof useEditor>, shapeIDs: readonly string[]): ScreenRect | null {
	const boxes = shapeIDs.flatMap((shapeID) => {
		if (!isShapeId(shapeID)) return []
		const bounds = editor.getShapePageBounds(shapeID)
		return bounds ? [bounds] : []
	})
	if (boxes.length === 0) return null

	const minX = Math.min(...boxes.map((box) => box.minX))
	const minY = Math.min(...boxes.map((box) => box.minY))
	const maxX = Math.max(...boxes.map((box) => box.maxX))
	const maxY = Math.max(...boxes.map((box) => box.maxY))
	const topLeft = editor.pageToScreen({ x: minX, y: minY })
	const bottomRight = editor.pageToScreen({ x: maxX, y: maxY })
	const padding = 18

	return {
		height: Math.max(44, bottomRight.y - topLeft.y + padding * 2),
		left: topLeft.x - padding,
		top: topLeft.y - padding,
		width: Math.max(44, bottomRight.x - topLeft.x + padding * 2),
	}
}
