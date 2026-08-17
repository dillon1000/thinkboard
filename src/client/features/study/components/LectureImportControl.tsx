import {
	LECTURE_SHAPE_TYPE,
	MAX_AUDIO_BYTES,
	apiRoutes,
	lectureSummarySchema,
	type LectureSummary,
} from '@agentboard/shared'
import { z } from 'zod'
import {
	IconHeadphones,
	IconMicrophone,
	IconPlayerStop,
	IconTrash,
	IconUpload,
	IconX,
} from '@tabler/icons-react'
import {
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type DragEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { createShapeId, type Editor } from 'tldraw'
import { apiRequest } from '../../../lib/api'
import './lectureImport.css'

interface LectureImportControlProps {
	boardID: string
	editor: Editor
}

export function LectureImportControl({ boardID, editor }: LectureImportControlProps) {
	const [isOpen, setIsOpen] = useState(false)

	return (
		<>
			<button
				className="RibbonMenu-item"
				onClick={() => setIsOpen(true)}
				type="button"
			>
				<span aria-hidden="true" className="RibbonMenu-itemIcon">
					<IconHeadphones size={17} stroke={1.7} />
				</span>
				<span>Import or record lecture</span>
			</button>
			{isOpen ? createPortal(
				<LectureImportDialog
					boardID={boardID}
					editor={editor}
					onClose={() => setIsOpen(false)}
				/>,
				document.body
			) : null}
		</>
	)
}

function LectureImportDialog({
	boardID,
	editor,
	onClose,
}: LectureImportControlProps & { onClose: () => void }) {
	const [lectures, setLectures] = useState<LectureSummary[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isUploading, setIsUploading] = useState(false)
	const [isRecording, setIsRecording] = useState(false)
	const [recordedSeconds, setRecordedSeconds] = useState(0)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const recorderRef = useRef<MediaRecorder | null>(null)
	const recordingChunksRef = useRef<Blob[]>([])
	const recordingStreamRef = useRef<MediaStream | null>(null)
	const recordingTimerRef = useRef<number | null>(null)

	useEffect(() => {
		void loadLectures()
	}, [boardID])

	useEffect(() => {
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !isRecording) onClose()
		}
		window.addEventListener('keydown', closeOnEscape)
		return () => window.removeEventListener('keydown', closeOnEscape)
	}, [isRecording, onClose])

	useEffect(() => () => stopRecordingResources(), [])

	async function loadLectures() {
		try {
			const response = await apiRequest<{ lectures: LectureSummary[] }>(
				apiRoutes.boardLectures(boardID)
			)
			setLectures(response.lectures)
			setError(null)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load lectures')
		} finally {
			setIsLoading(false)
		}
	}

	async function uploadFile(file: File | Blob, title: string) {
		if (!file.size) throw new Error('The recording is empty')
		if (file.size > MAX_AUDIO_BYTES) throw new Error('Audio files must be 20 MB or smaller')
		setIsUploading(true)
		setError(null)
		try {
			const mediaType = file.type || 'audio/webm'
			const response = await fetch(
				`${apiRoutes.boardLectures(boardID)}?title=${encodeURIComponent(title)}`,
				{
					body: file,
					headers: { 'content-type': mediaType },
					method: 'POST',
				}
			)
			const body = await response.json().catch(() => null)
			if (!response.ok) {
				const errorBody = z.object({ error: z.string() }).safeParse(body)
				const message = errorBody.success
					? errorBody.data.error
					: 'Unable to upload this lecture'
				throw new Error(message)
			}
			const result = z.object({ lecture: lectureSummarySchema }).safeParse(body)
			if (!result.success) throw new Error('The lecture upload returned no record')
			const lecture: LectureSummary = result.data.lecture
			setLectures((current) => [lecture, ...current])
			placeLecture(editor, lecture)
			onClose()
		} finally {
			setIsUploading(false)
		}
	}

	async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		if (!file) return
		try {
			await uploadFile(file, file.name.replace(/\.[^.]+$/, '').slice(0, 180))
		} catch (uploadError) {
			setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload this lecture')
		}
		event.target.value = ''
	}

	async function dropFile(event: DragEvent<HTMLDivElement>) {
		event.preventDefault()
		const file = event.dataTransfer.files[0]
		if (!file) return
		try {
			await uploadFile(file, file.name.replace(/\.[^.]+$/, '').slice(0, 180))
		} catch (uploadError) {
			setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload this lecture')
		}
	}

	async function startRecording() {
		setError(null)
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			const mediaType = selectRecordingMediaType()
			const recorder = new MediaRecorder(stream, mediaType ? { mimeType: mediaType } : undefined)
			recordingChunksRef.current = []
			recordingStreamRef.current = stream
			recorderRef.current = recorder
			recorder.addEventListener('dataavailable', (event) => {
				if (event.data.size) recordingChunksRef.current.push(event.data)
			})
			recorder.addEventListener('stop', () => {
				const blob = new Blob(recordingChunksRef.current, {
					type: recorder.mimeType || 'audio/webm',
				})
				stopRecordingResources()
				setIsRecording(false)
				const title = `Recorded lecture · ${new Intl.DateTimeFormat(undefined, {
					dateStyle: 'medium',
					timeStyle: 'short',
				}).format(new Date())}`
				void uploadFile(blob, title).catch((uploadError) => {
					setError(uploadError instanceof Error
						? uploadError.message
						: 'Unable to upload this recording')
				})
			})
			recorder.start(1_000)
			setRecordedSeconds(0)
			setIsRecording(true)
			recordingTimerRef.current = window.setInterval(() => {
				setRecordedSeconds((current) => current + 1)
			}, 1_000)
		} catch (recordError) {
			stopRecordingResources()
			setError(recordError instanceof Error
				? recordError.message
				: 'Microphone access is unavailable')
		}
	}

	function stopRecording() {
		if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
	}

	function stopRecordingResources() {
		if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
		recordingTimerRef.current = null
		for (const track of recordingStreamRef.current?.getTracks() ?? []) track.stop()
		recordingStreamRef.current = null
		recorderRef.current = null
	}

	async function deleteLecture(lecture: LectureSummary) {
		if (!window.confirm(`Delete “${lecture.title}” and its transcript?`)) return
		try {
			await apiRequest(apiRoutes.boardLecture(boardID, lecture.id), { method: 'DELETE' })
			setLectures((current) => current.filter(({ id }) => id !== lecture.id))
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this lecture')
		}
	}

	return (
		<div
			aria-labelledby="lecture-import-heading"
			aria-modal="true"
			className="LectureImport-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget && !isRecording) onClose()
			}}
			role="dialog"
		>
			<section className="LectureImport">
				<header>
					<div>
						<p className="Eyebrow">Recorded lectures</p>
						<h2 id="lecture-import-heading">Add lecture audio</h2>
						<p>Audio becomes a timestamped, searchable transcript on this canvas.</p>
					</div>
					<button aria-label="Close lecture import" disabled={isRecording} onClick={onClose} type="button">
						<IconX aria-hidden="true" size={18} />
					</button>
				</header>
				{error ? <p className="FormError" role="alert">{error}</p> : null}
				<div
					className="LectureImport-drop"
					onDragOver={(event) => event.preventDefault()}
					onDrop={(event) => void dropFile(event)}
				>
					<IconUpload aria-hidden="true" size={20} />
					<div><strong>Drop an audio file</strong><small>MP3, M4A, WAV, OGG, FLAC, or WebM · 20 MB max</small></div>
					<button disabled={isUploading || isRecording} onClick={() => fileInputRef.current?.click()} type="button">
						{isUploading ? 'Uploading…' : 'Choose file'}
					</button>
					<input
						accept="audio/*,.m4a,.webm"
						hidden
						onChange={(event) => void chooseFile(event)}
						ref={fileInputRef}
						type="file"
					/>
				</div>
				<div className="LectureImport-record">
					<div>
						<IconMicrophone aria-hidden="true" size={18} />
						<span><strong>Record now</strong><small>{isRecording ? formatRecordingTime(recordedSeconds) : 'Use this device’s microphone.'}</small></span>
					</div>
					<button
						className={isRecording ? 'is-recording' : ''}
						disabled={isUploading}
						onClick={isRecording ? stopRecording : () => void startRecording()}
						type="button"
					>
						{isRecording
							? <><IconPlayerStop aria-hidden="true" size={14} /> Stop</>
							: 'Start recording'}
					</button>
				</div>
				<div className="LectureImport-list">
					<h3>In this space</h3>
					{isLoading ? <p>Loading lectures…</p> : null}
					{!isLoading && !lectures.length ? <p>No recorded lectures yet.</p> : null}
					{lectures.map((lecture) => (
						<article key={lecture.id}>
							<span><strong>{lecture.title}</strong><small>{lecture.status}</small></span>
							<button onClick={() => placeLecture(editor, lecture)} type="button">Place</button>
							<button aria-label={`Delete ${lecture.title}`} onClick={() => void deleteLecture(lecture)} type="button">
								<IconTrash aria-hidden="true" size={14} />
							</button>
						</article>
					))}
				</div>
			</section>
		</div>
	)
}

function placeLecture(editor: Editor, lecture: LectureSummary) {
	const viewport = editor.getViewportPageBounds()
	const id = createShapeId()
	editor.createShape({
		id,
		type: LECTURE_SHAPE_TYPE,
		x: viewport.center.x - 260,
		y: viewport.center.y - 250,
		props: {
			h: 500,
			lectureID: lecture.id,
			schemaVersion: 1,
			title: lecture.title,
			w: 520,
		},
	})
	editor.setSelectedShapes([id])
	editor.zoomToSelection({ animation: { duration: 220 } })
}

function selectRecordingMediaType() {
	return [
		'audio/webm;codecs=opus',
		'audio/mp4',
		'audio/webm',
	].find((mediaType) => MediaRecorder.isTypeSupported(mediaType)) ?? ''
}

function formatRecordingTime(value: number) {
	return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}
