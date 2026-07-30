import {
	getDefaultUserPresence,
	TLINSTANCE_ID,
	type Editor,
	type TLInstancePresence,
	type TLStore,
	type TLUser,
} from 'tldraw'

const PROJECTOR_META_KEY = 'agentboardProjector'
const PROJECTOR_CODE_LENGTH = 6

export type ProjectorPresenceMode = 'controller' | 'projector'

export interface ProjectorPresenceMetadata {
	[key: string]: string
	code: string
	mode: ProjectorPresenceMode
}

/**
 * Adds temporary projector state to tldraw presence. Presence is visible only to authenticated
 * board members and disappears with the socket, so pairing does not become board content.
 */
export function getProjectorUserPresence(store: TLStore, user: TLUser) {
	const presence = getDefaultUserPresence(store, user)
	if (!presence) return null

	const projector = readProjectorPresenceMetadata(store.get(TLINSTANCE_ID)?.meta)
	return {
		...presence,
		meta: projector ? { [PROJECTOR_META_KEY]: projector } : {},
	}
}

/** Publishes or clears the local tab's role in a temporary projector session. */
export function setProjectorPresenceMetadata(
	editor: Editor,
	projector: ProjectorPresenceMetadata | null
) {
	const currentMeta = editor.getInstanceState().meta
	const nextMeta = Object.fromEntries(
		Object.entries(currentMeta).filter(([key]) => key !== PROJECTOR_META_KEY)
	)

	editor.updateInstanceState({
		meta: projector ? { ...nextMeta, [PROJECTOR_META_KEY]: projector } : nextMeta,
	})
}

export function readProjectorPresenceMetadata(
	meta: TLInstancePresence['meta'] | undefined
): ProjectorPresenceMetadata | null {
	const projector = meta?.[PROJECTOR_META_KEY]
	if (!projector || typeof projector !== 'object' || Array.isArray(projector)) return null

	const code = projector.code
	const mode = projector.mode
	if (
		typeof code !== 'string' ||
		!isProjectorCode(code) ||
		(mode !== 'controller' && mode !== 'projector')
	) return null

	return { code, mode }
}

/** Generates a zero-padded six-digit code with the browser's cryptographic random source. */
export function createProjectorCode() {
	const value = new Uint32Array(1)
	crypto.getRandomValues(value)
	return String(value[0] % (10 ** PROJECTOR_CODE_LENGTH)).padStart(PROJECTOR_CODE_LENGTH, '0')
}

export function normalizeProjectorCode(value: string) {
	return value.replace(/\D/g, '').slice(0, PROJECTOR_CODE_LENGTH)
}

export function formatProjectorCode(value: string) {
	const code = normalizeProjectorCode(value)
	return code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

export function isProjectorCode(value: string) {
	return new RegExp(`^\\d{${PROJECTOR_CODE_LENGTH}}$`).test(value)
}

export function formatProjectorTime(date: Date, locales?: Intl.LocalesArgument) {
	return new Intl.DateTimeFormat(locales, {
		hour: 'numeric',
		minute: '2-digit',
	}).format(date)
}
