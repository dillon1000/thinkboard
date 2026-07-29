/** The named menus on the bar, in the order they appear. */
export const RIBBON_MENU_IDS = ['board', 'edit', 'view'] as const

/** Every dropdown on the bar: the named menus plus the quick-access pickers beside them. */
export type RibbonMenuID = (typeof RIBBON_MENU_IDS)[number] | 'colour' | 'style' | 'tools'
