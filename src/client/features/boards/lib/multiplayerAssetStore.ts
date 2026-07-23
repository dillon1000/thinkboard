import { apiRoutes } from '@agentboard/shared'
import { TLAssetStore, uniqueId } from 'tldraw'

export function createMultiplayerAssetStore(boardID: string): TLAssetStore {
	return {
		async upload(_asset, file) {
			const assetID = uniqueId()
			const objectName = `${assetID}-${file.name}`.replace(/[^a-zA-Z0-9.]/g, '-')
			const url = apiRoutes.asset(boardID, objectName)

			const response = await fetch(url, {
				method: 'POST',
				body: file,
			})

			if (!response.ok) {
				throw new Error(`Failed to upload asset: ${response.statusText}`)
			}

			return { src: url }
		},

		resolve(asset) {
			return asset.props.src
		},
	}
}
