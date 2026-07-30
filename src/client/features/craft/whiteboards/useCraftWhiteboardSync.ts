import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import {
	hasCraftWhiteboardLocalChanges,
	listImportedCraftWhiteboards,
	syncCraftWhiteboard,
	type CraftWhiteboardSyncResolution,
} from './craftWhiteboardCanvas'

const CRAFT_PULL_INTERVAL_MS = 30_000
const CRAFT_PUSH_DELAY_MS = 2_000

export type CraftWhiteboardSyncStatus =
	'conflict' | 'error' | 'local-changes' | 'synced' | 'syncing' | 'unavailable'

export interface CraftWhiteboardSyncState {
	error: string | null
	status: CraftWhiteboardSyncStatus
}

const DEFAULT_SYNC_STATE: CraftWhiteboardSyncState = {
	error: null,
	status: 'synced',
}

/**
 * Polls Craft while the board is visible and pushes local edits after a short quiet period.
 * Revision checks in the Worker turn concurrent edits into an explicit conflict.
 */
export function useCraftWhiteboardSync({
	boardID,
	currentUserID,
	editor,
	onIssue,
}: {
	boardID: string
	currentUserID: string | null
	editor: Editor | null
	onIssue: (message: string) => void
}) {
	const [states, setStates] = useState<Record<string, CraftWhiteboardSyncState>>({})
	const statesRef = useRef(states)
	const runningFrameIDsRef = useRef(new Set<TLShapeId>())
	const pushTimersRef = useRef(new Map<TLShapeId, number>())

	const updateState = useCallback((
		frameID: TLShapeId,
		next: CraftWhiteboardSyncState
	) => {
		const previous = statesRef.current[frameID]
		if (previous?.status === next.status && previous.error === next.error) return
		const updated = { ...statesRef.current, [frameID]: next }
		statesRef.current = updated
		setStates(updated)
	}, [])

	const syncFrame = useCallback(async (
		frameID: TLShapeId,
		resolution: CraftWhiteboardSyncResolution = 'safe'
	) => {
		if (!editor || runningFrameIDsRef.current.has(frameID)) return
		const whiteboard = listImportedCraftWhiteboards(editor)
			.find((item) => item.frameID === frameID)
		if (
			!currentUserID ||
			(whiteboard?.connectionOwnerID && whiteboard.connectionOwnerID !== currentUserID)
		) {
			updateState(frameID, { error: null, status: 'unavailable' })
			return
		}
		runningFrameIDsRef.current.add(frameID)
		const previousStatus = statesRef.current[frameID]?.status
		updateState(frameID, { error: null, status: 'syncing' })
		try {
			const result = await syncCraftWhiteboard(
				editor,
				boardID,
				frameID,
				resolution
			)
			if (result.status === 'conflict') {
				updateState(frameID, { error: null, status: 'conflict' })
				if (previousStatus !== 'conflict') {
					onIssue(`“${result.title}” changed in Craft and Thinkspace. Choose which copy to keep.`)
				}
				return
			}
			updateState(frameID, DEFAULT_SYNC_STATE)
		} catch (error) {
			const message = error instanceof Error
				? error.message
				: 'Craft whiteboard sync failed.'
			updateState(frameID, { error: message, status: 'error' })
			if (previousStatus !== 'error') onIssue(message)
		} finally {
			runningFrameIDsRef.current.delete(frameID)
		}
	}, [boardID, currentUserID, editor, onIssue, updateState])

	useEffect(() => {
		if (!editor) return

		const syncAll = async () => {
			if (document.visibilityState === 'hidden') return
			for (const { connectionOwnerID, frameID } of listImportedCraftWhiteboards(editor)) {
				if (connectionOwnerID && connectionOwnerID !== currentUserID) {
					updateState(frameID, { error: null, status: 'unavailable' })
					continue
				}
				if (statesRef.current[frameID]?.status === 'conflict') continue
				await syncFrame(frameID)
			}
		}
		const assessLocalChanges = async () => {
			for (const { connectionOwnerID, frameID } of listImportedCraftWhiteboards(editor)) {
				if (
					(connectionOwnerID && connectionOwnerID !== currentUserID) ||
					runningFrameIDsRef.current.has(frameID) ||
					statesRef.current[frameID]?.status === 'conflict'
				) continue
				if (!await hasCraftWhiteboardLocalChanges(editor, frameID)) continue
				updateState(frameID, { error: null, status: 'local-changes' })
				const currentTimer = pushTimersRef.current.get(frameID)
				if (currentTimer) window.clearTimeout(currentTimer)
				pushTimersRef.current.set(frameID, window.setTimeout(() => {
					pushTimersRef.current.delete(frameID)
					void syncFrame(frameID)
				}, CRAFT_PUSH_DELAY_MS))
			}
		}
		const hasShapeChanges = (entry: Parameters<Parameters<typeof editor.store.listen>[0]>[0]) =>
			[entry.changes.added, entry.changes.updated, entry.changes.removed]
				.some((changes) => Object.values(changes).some((record) => {
					const value = Array.isArray(record) ? record[1] : record
					return value.typeName === 'shape'
				}))
		const stopListening = editor.store.listen((entry) => {
			if (hasShapeChanges(entry)) void assessLocalChanges()
		}, { scope: 'document', source: 'user' })
		const interval = window.setInterval(() => void syncAll(), CRAFT_PULL_INTERVAL_MS)
		const handleFocus = () => void syncAll()
		window.addEventListener('focus', handleFocus)
		void syncAll()

		return () => {
			stopListening()
			window.clearInterval(interval)
			window.removeEventListener('focus', handleFocus)
			for (const timer of pushTimersRef.current.values()) window.clearTimeout(timer)
			pushTimersRef.current.clear()
		}
	}, [editor, syncFrame, updateState])

	return {
		states,
		syncFrame,
	}
}
