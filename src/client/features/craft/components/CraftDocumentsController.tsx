import { useEffect, useState } from 'react'
import type { Editor } from 'tldraw'
import {
	CRAFT_DOCUMENT_PREVIEW_EVENT,
	readCraftDocumentPreviewEvent,
} from '../craftPreviewEvent'
import { CraftDocumentsDialog } from './CraftDocumentsDialog'

export function CraftDocumentsController({
	boardID,
	editor,
}: {
	boardID: string
	editor: Editor | null
}) {
	const [isOpen, setIsOpen] = useState(false)
	const [initialLinkID, setInitialLinkID] = useState<string | null>(null)

	useEffect(() => {
		const openDocuments = (event: Event) => {
			const linkID = readCraftDocumentPreviewEvent(event)
			if (linkID === undefined) return
			setInitialLinkID(linkID)
			setIsOpen(true)
		}
		window.addEventListener(CRAFT_DOCUMENT_PREVIEW_EVENT, openDocuments)
		return () => window.removeEventListener(CRAFT_DOCUMENT_PREVIEW_EVENT, openDocuments)
	}, [])

	if (!isOpen) return null
	return (
		<CraftDocumentsDialog
			boardID={boardID}
			editor={editor}
			initialLinkID={initialLinkID}
			onClose={() => {
				setIsOpen(false)
				setInitialLinkID(null)
			}}
		/>
	)
}
