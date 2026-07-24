export type BoardRole = 'owner' | 'editor' | 'viewer'

export interface Board {
	id: string
	title: string
	role: BoardRole
	createdAt: string
	updatedAt: string
}

export interface PublicConfig {
	oAuth: {
		enabled: boolean
		providerID: string
		providerName: string
	}
	spotify: {
		enabled: boolean
	}
	tldrawLicenseKey: string | null
}

export interface StudyConversation {
	agentName: string
	boardID: string
	createdAt: string
	id: string
	title: string
	updatedAt: string
}
