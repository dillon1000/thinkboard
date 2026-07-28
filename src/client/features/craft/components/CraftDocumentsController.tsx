import { apiRoutes, type Board } from '@agentboard/shared'
import { useEffect, useRef, useState } from 'react'
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
	saveCraftWhiteboard,
} from '../whiteboards/craftWhiteboardCanvas'
import { CraftDocumentsDialog } from './CraftDocumentsDialog'
import { CraftWhiteboardImportDialog } from './CraftWhiteboardImportDialog'

export function CraftDocumentsController({
	boardID,
	editor,
}: {
	boardID: string
	editor: Editor | null
}) {
	const [openDialog, setOpenDialog] = useState<'documents' | 'whiteboards' | null>(null)
	const [initialLinkID, setInitialLinkID] = useState<string | null>(null)
	const [boardTitle, setBoardTitle] = useState('Current board')
	const [notice, setNotice] = useState<string | null>(null)
	const handledImportRef = useRef<string | null>(null)

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
		void apiRequest<{ board: Board }>(apiRoutes.board(boardID))
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
		}).catch((error: unknown) => {
			setNotice(error instanceof Error ? error.message : 'Unable to import this Craft whiteboard.')
		})
	}, [boardID, editor])

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
						? listImportedCraftWhiteboards(editor).map(({ frameID, title }) => ({
								frameID,
								title,
							}))
						: []}
					initialBoardID={boardID}
					onClose={() => setOpenDialog(null)}
					onImport={async (request) => {
						if (!editor) throw new Error('The board is still loading. Try again.')
						await importCraftWhiteboard(
							editor,
							boardID,
							request.documentID,
							request.whiteboardBlockID
						)
						setOpenDialog(null)
					}}
					onSaveImported={async (frameID) => {
						if (!editor) throw new Error('The board is still loading. Try again.')
						await saveCraftWhiteboard(editor, boardID, frameID as TLShapeId)
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
