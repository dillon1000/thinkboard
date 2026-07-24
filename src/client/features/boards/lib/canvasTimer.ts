export function formatCanvasTimerTime(elapsedMS: number) {
	const totalSeconds = Math.max(0, Math.floor(elapsedMS / 1_000))
	const hours = Math.floor(totalSeconds / 3_600)
	const minutes = Math.floor(totalSeconds / 60) % 60
	const seconds = totalSeconds % 60
	const paddedMinutes = minutes.toString().padStart(2, '0')
	const paddedSeconds = seconds.toString().padStart(2, '0')

	return hours > 0
		? `${hours}:${paddedMinutes}:${paddedSeconds}`
		: `${paddedMinutes}:${paddedSeconds}`
}
