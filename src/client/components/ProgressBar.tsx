interface ProgressBarProps {
	label: string
}

/** An indeterminate bar for waits with no measurable progress. */
export function ProgressBar({ label }: ProgressBarProps) {
	return <div aria-label={label} className="ProgressBar" role="progressbar" />
}
