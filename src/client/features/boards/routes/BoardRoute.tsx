import { useSync } from '@tldraw/sync'
import {
	FLASHCARD_SHAPE_TYPE,
	PDF_PAGE_SHAPE_TYPE,
	apiRoutes,
	type Board,
	type BoardRole,
	type PublicConfig,
} from '@agentboard/shared'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Editor, Tldraw, type TLShape, type TLShapeId } from 'tldraw'
import { ProgressBar } from '../../../components/ProgressBar'
import { authClient } from '../../../lib/authClient'
import { apiRequest } from '../../../lib/api'
import { BoardShell } from '../components/BoardShell'
import { StudyPanel } from '../../study/components/StudyPanel'
import { canvasShapeUtils, synchronizedShapeUtils } from '../lib/canvasShapes'
import { createCanvasComponents } from '../lib/canvasComponents'
import { canvasOverrides, canvasTools } from '../lib/canvasOverrides'
import { getBookmarkPreview } from '../lib/getBookmarkPreview'
import { createMultiplayerAssetStore } from '../lib/multiplayerAssetStore'
import { canvasThemes } from '../lib/canvasThemes'
import { useTheme } from '../../theme/ThemeProvider'
import { LockInProvider } from '../../lock-in/LockInProvider'
import { ZenModeProvider } from '../lib/ZenModeProvider'
import { ProjectorModeProvider } from '../lib/ProjectorModeProvider'
import { getProjectorUserPresence } from '../lib/projectorMode'
import { CraftDocumentsController } from '../../craft/components/CraftDocumentsController'
import { ExamPracticeImport } from '../components/ExamPracticeImport'
import { useCanvasArtifactIndex } from '../../study/lib/useCanvasArtifactIndex'

export function Component() {
	const { boardID } = useParams<{ boardID: string }>()
	const resolvedBoardID = boardID ?? ''
	const session = authClient.useSession()
	const { theme } = useTheme()
	const [editor, setEditor] = useState<Editor | null>(null)
	const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null)
	const [configError, setConfigError] = useState<string | null>(null)
	const [title, setTitle] = useState('Study space')
	const [role, setRole] = useState<BoardRole>('viewer')
	const [searchParameters, setSearchParameters] = useSearchParams()
	const examID = searchParameters.get('examPlan')
	const focusShapeID = searchParameters.get('focusShape')
	const focusDocumentID = searchParameters.get('focusDocument')
	const focusPage = Number(searchParameters.get('focusPage'))
	const assets = useMemo(() => createMultiplayerAssetStore(resolvedBoardID), [resolvedBoardID])
	const components = useMemo(() => createCanvasComponents(resolvedBoardID), [resolvedBoardID])
	useCanvasArtifactIndex(editor, resolvedBoardID, role !== 'viewer')

	const store = useSync({
		uri: `${window.location.origin}${apiRoutes.boardSocket(resolvedBoardID)}`,
		assets,
		getUserPresence: getProjectorUserPresence,
		shapeUtils: synchronizedShapeUtils,
	})

	useEffect(() => {
		if (!resolvedBoardID) return
		void apiRequest<{ board: Board }>(apiRoutes.board(resolvedBoardID))
			.then((response) => {
				setRole(response.board.role)
				setTitle(response.board.title)
			})
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
		// Viewer mode blocks shared canvas mutations while custom flashcard controls stay interactive.
		editor.updateInstanceState({ isReadonly: role === 'viewer' })
	}, [editor, role])

	useEffect(() => {
		if (!editor || (!focusShapeID && (!focusDocumentID || !Number.isInteger(focusPage)))) return
		const focusTarget = () => {
			const target = focusShapeID
				? editor.getShape(focusShapeID as TLShapeId)
				: findPDFPageShape(editor, focusDocumentID ?? '', focusPage)
			if (!target) return false
			const pageID = editor.getAncestorPageId(target)
			if (pageID && pageID !== editor.getCurrentPageId()) editor.setCurrentPage(pageID)
			editor.setSelectedShapes([target.id])
			editor.zoomToSelection({ animation: { duration: 280 } })
			const nextParameters = new URLSearchParams(searchParameters)
			nextParameters.delete('focusShape')
			nextParameters.delete('focusDocument')
			nextParameters.delete('focusPage')
			setSearchParameters(nextParameters, { replace: true })
			return true
		}
		if (focusTarget()) return
		const stopListening = editor.store.listen(() => {
			if (focusTarget()) stopListening()
		}, { scope: 'document' })
		const timeout = window.setTimeout(stopListening, 8_000)
		return () => {
			window.clearTimeout(timeout)
			stopListening()
		}
	}, [
		editor,
		focusDocumentID,
		focusPage,
		focusShapeID,
		setSearchParameters,
	])

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

	useEffect(() => {
		if (!editor) return
		return editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
			if (shape.type === FLASHCARD_SHAPE_TYPE) {
				void apiRequest(apiRoutes.boardFlashcard(resolvedBoardID, shape.id), {
					method: 'DELETE',
				}).catch(() => undefined)
			}
			void apiRequest(apiRoutes.boardArtifact(resolvedBoardID, shape.id), {
				method: 'DELETE',
			}).catch(() => undefined)
		})
	}, [editor, resolvedBoardID])

	if (!boardID) throw new Error('Missing space ID')
	if (configError) return <div className="RouteMessage" role="alert"><h1>Unable to open this space</h1><p>{configError}</p></div>
	if (!publicConfig) return <div className="AppLoading"><ProgressBar label="Opening your space" /></div>

	return (
		<ProjectorModeProvider>
		<ZenModeProvider>
		<LockInProvider boardID={boardID} editor={editor}>
			<CraftDocumentsController
				boardID={boardID}
				currentUserID={session.data?.user.id ?? null}
				editor={editor}
			/>
			<BoardShell boardID={boardID} role={role} studyPanel={session.data ? <StudyPanel boardID={boardID} editor={editor} /> : null} title={title}>
				<div className="BoardCanvas">
					<Tldraw
						components={components}
						licenseKey={publicConfig.tldrawLicenseKey ?? undefined}
						store={store}
						themes={canvasThemes}
						shapeUtils={canvasShapeUtils}
						tools={canvasTools}
						overrides={canvasOverrides}
						options={{ deepLinks: true }}
						onMount={(editor) => {
							setEditor(editor)
							editor.user.updateUserPreferences({ colorScheme: theme })
							editor.registerExternalAssetHandler('url', getBookmarkPreview)
						}}
					/>
					{editor && examID && role !== 'viewer' ? (
						<ExamPracticeImport
							boardID={boardID}
							editor={editor}
							examID={examID}
							onClose={() => {
								searchParameters.delete('examPlan')
								setSearchParameters(searchParameters, { replace: true })
							}}
						/>
					) : null}
				</div>
			</BoardShell>
		</LockInProvider>
		</ZenModeProvider>
		</ProjectorModeProvider>
	)
}

function findPDFPageShape(editor: Editor, documentID: string, pageNumber: number): TLShape | undefined {
	for (const page of editor.getPages()) {
		for (const shapeID of editor.getPageShapeIds(page)) {
			const shape = editor.getShape(shapeID)
			if (
				shape?.type === PDF_PAGE_SHAPE_TYPE &&
				Reflect.get(shape.props, 'documentId') === documentID &&
				Reflect.get(shape.props, 'pageNumber') === pageNumber
			) return shape
		}
	}
	return undefined
}
