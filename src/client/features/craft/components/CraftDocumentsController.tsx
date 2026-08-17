import { apiRoutes, boardSchema } from '@agentboard/shared'
import { z } from 'zod'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Editor, type TLShapeId } from 'tldraw'
import { apiRequest } from '../../../lib/api'
import {
	CRAFT_DOCUMENT_PREVIEW_EVENT,
	readCraftDocumentPreviewEvent,
} from '../craftPreviewEvent'
import {
	clearCraftWhiteboardImportParameters,
	readCraftWhiteboardImportParameters,
} from '../whiteboards/craftWhiteboardNavigation'
import {
	importCraftWhiteboard,
	listImportedCraftWhiteboards,
} from '../whiteboards/craftWhiteboardCanvas'
import { useCraftWhiteboardSync } from '../whiteboards/useCraftWhiteboardSync'
import { CraftDocumentsDialog } from './CraftDocumentsDialog'
import { CraftWhiteboardImportDialog } from './CraftWhiteboardImportDialog'

export function CraftDocumentsController({
	boardID,
	currentUserID,
	editor,
}: {
	boardID: string
	currentUserID: string | null
	editor: Editor | null
}) {
	const [openDialog, setOpenDialog] = useState<'documents' | 'whiteboards' | null>(null)
	const [initialLinkID, setInitialLinkID] = useState<string | null>(null)
	const [boardTitle, setBoardTitle] = useState('Current space')
	const [notice, setNotice] = useState<string | null>(null)
	const handledImportRef = useRef<string | null>(null)
	const noticeTimerRef = useRef<number | null>(null)
	const showSyncIssue = useCallback((message: string) => {
		if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
		setNotice(message)
		noticeTimerRef.current = window.setTimeout(() => setNotice(null), 6_000)
	}, [])
	const { states: whiteboardSyncStates, syncFrame } = useCraftWhiteboardSync({
		boardID,
		currentUserID,
		editor,
		onIssue: showSyncIssue,
	})

	useEffect(() => {
		const openDocuments = (event: Event) => {
			const linkID = readCraftDocumentPreviewEvent(event)
			if (linkID === undefined) return
			setInitialLinkID(linkID)
			setOpenDialog('documents')
		}
		window.addEventListener(CRAFT_DOCUMENT_PREVIEW_EVENT, openDocuments)
		return () => window.removeEventListener(CRAFT_DOCUMENT_PREVIEW_EVENT, openDocuments)
	}, [])

	useEffect(() => {
		void apiRequest(apiRoutes.board(boardID), undefined, z.object({ board: boardSchema }))
			.then(({ board }) => setBoardTitle(board.title))
			.catch(() => undefined)
	}, [boardID])

	useEffect(() => {
		if (!editor) return
		const request = readCraftWhiteboardImportParameters(window.location.search)
		if (!request) return
		const key = `${request.documentID}:${request.whiteboardBlockID}`
		if (handledImportRef.current === key) return
		handledImportRef.current = key
		clearCraftWhiteboardImportParameters()
		setNotice('Importing Craft whiteboard…')
		void importCraftWhiteboard(
			editor,
			boardID,
			request.documentID,
			request.whiteboardBlockID
		).then((whiteboard) => {
			setNotice(`Imported “${whiteboard.title}” as editable shapes.`)
			window.setTimeout(() => setNotice(null), 2_800)
		}).catch((error) => {
			setNotice(error instanceof Error ? error.message : 'Unable to import this Craft whiteboard.')
		})
	}, [boardID, editor])

	useEffect(() => () => {
		if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
	}, [])

	return (
		<>
			{openDialog === 'documents' ? (
				<CraftDocumentsDialog
					boardID={boardID}
					editor={editor}
					initialLinkID={initialLinkID}
					onClose={() => {
						setOpenDialog(null)
						setInitialLinkID(null)
					}}
					onOpenWhiteboards={() => {
						setOpenDialog('whiteboards')
						setInitialLinkID(null)
					}}
				/>
			) : null}
			{openDialog === 'whiteboards' ? (
				<CraftWhiteboardImportDialog
					boards={[{ id: boardID, title: boardTitle }]}
					importedWhiteboards={editor
						? listImportedCraftWhiteboards(editor).map(({
								connectionOwnerID,
								frameID,
								localRevision,
								remoteRevision,
								title,
							}) => ({
								frameID,
								syncError: whiteboardSyncStates[frameID]?.error ?? null,
								syncStatus: whiteboardSyncStates[frameID]?.status ??
									(connectionOwnerID && connectionOwnerID !== currentUserID
										? 'unavailable'
										: localRevision && remoteRevision
											? 'synced'
											: 'syncing'),
								title,
							}))
						: []}
					initialBoardID={boardID}
					onClose={() => setOpenDialog(null)}
					onImport={async (request) => {
						if (!editor) throw new Error('The space is still loading. Try again.')
						await importCraftWhiteboard(
							editor,
							boardID,
							request.documentID,
							request.whiteboardBlockID
						)
						setOpenDialog(null)
					}}
					onSyncImported={async (frameID, resolution) => {
						if (!editor) throw new Error('The space is still loading. Try again.')
						await syncFrame(frameID as TLShapeId, resolution)
					}}
				/>
			) : null}
			{notice ? createPortal(
				<div className="CraftWhiteboard-notice" role="status">{notice}</div>,
				document.body
			) : null}
		</>
	)
}
