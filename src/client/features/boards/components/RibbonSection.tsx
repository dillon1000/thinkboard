import type { ReactNode } from 'react'

/** A captioned run of controls inside one of the menubar's dropdowns. */
export function RibbonSection({ children, label }: { children: ReactNode; label: string }) {
	return (
		<section aria-label={label} className="RibbonMenu-section">
			<p className="RibbonMenu-sectionLabel">{label}</p>
			{children}
		</section>
	)
}
