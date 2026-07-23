import { useSync } from '@tldraw/sync'
import { PDF_PAGE_SHAPE_TYPE, apiRoutes, type Board, type PublicConfig } from '@agentboard/shared'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Editor, Tldraw } from 'tldraw'
import { authClient } from '../../../lib/authClient'
import { apiRequest } from '../../../lib/api'
import { BoardShell } from '../components/BoardShell'
import { StudyPanel } from '../../study/components/StudyPanel'
import { PDFImportControl } from '../../study/components/PDFImportControl'
import { studyShapeUtils, synchronizedShapeUtils } from '../../study/shapes/studyShapeUtils'
import { getBookmarkPreview } from '../lib/getBookmarkPreview'
import { createMultiplayerAssetStore } from '../lib/multiplayerAssetStore'
import { useTheme } from '../../theme/ThemeProvider'

export function Component() {
	const { boardID } = useParams<{ boardID: string }>()
	const resolvedBoardID = boardID ?? ''
	const session = authClient.useSession()
	const { theme } = useTheme()
	const [editor, setEditor] = useState<Editor | null>(null)
	const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null)
	const [configError, setConfigError] = useState<string | null>(null)
	const [title, setTitle] = useState('Study board')
	const assets = useMemo(() => createMultiplayerAssetStore(resolvedBoardID), [resolvedBoardID])

	const store = useSync({
		uri: `${window.location.origin}${apiRoutes.boardSocket(resolvedBoardID)}`,
		assets,
		shapeUtils: synchronizedShapeUtils,
	})

	useEffect(() => {
		if (!resolvedBoardID) return
		void apiRequest<{ board: Board }>(apiRoutes.board(resolvedBoardID))
			.then((response) => setTitle(response.board.title))
			.catch(() => undefined)
	}, [resolvedBoardID])

	useEffect(() => {
		void apiRequest<PublicConfig>(apiRoutes.config)
			.then(setPublicConfig)
			.catch((error) => {
				setConfigError(error instanceof Error ? error.message : 'Unable to load canvas configuration')
			})
	}, [])

	useEffect(() => {
		if (!editor) return
		editor.user.updateUserPreferences({ colorScheme: theme })
	}, [editor, theme])

	useEffect(() => {
		if (!editor) return
		return editor.sideEffects.registerBeforeDeleteHandler('shape', (shape, source) => {
			if (
				source === 'user' &&
				shape.type === PDF_PAGE_SHAPE_TYPE &&
				editor.getCurrentToolId().startsWith('eraser')
			) return false
		})
	}, [editor])

	if (!boardID) throw new Error('Missing board ID')
	if (configError) return <div className="RouteMessage" role="alert"><h1>Unable to open this board</h1><p>{configError}</p></div>
	if (!publicConfig) return <div className="RouteMessage" role="status"><p>Opening your board…</p></div>

	return (
		<BoardShell boardID={boardID} studyPanel={session.data ? <StudyPanel boardID={boardID} editor={editor} /> : null} title={title}>
			<div className="BoardCanvas">
				<Tldraw
					licenseKey={publicConfig.tldrawLicenseKey ?? undefined}
					store={store}
					shapeUtils={studyShapeUtils}
					options={{ deepLinks: true }}
					onMount={(editor) => {
						setEditor(editor)
						editor.user.updateUserPreferences({ colorScheme: theme })
						editor.registerExternalAssetHandler('url', getBookmarkPreview)
					}}
				/>
				<PDFImportControl boardID={boardID} editor={editor} />
			</div>
		</BoardShell>
	)
}
