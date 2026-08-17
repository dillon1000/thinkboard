import { apiRoutes } from '@agentboard/shared'
import { AssetRecordType, TLAsset, TLBookmarkAsset, getHashForString } from 'tldraw'

export async function getBookmarkPreview({ url }: { url: string }): Promise<TLAsset> {
	const asset: TLBookmarkAsset = {
		id: AssetRecordType.createId(getHashForString(url)),
		typeName: 'asset',
		type: 'bookmark',
		meta: {},
		props: {
			src: url,
			description: '',
			image: '',
			favicon: '',
			title: '',
		},
	}

	try {
		const response = await fetch(apiRoutes.bookmarkPreview(url))
		if (!response.ok) return asset

		const data: unknown = await response.json()

		asset.props.description = getStringProperty(data, 'description')
		asset.props.image = getStringProperty(data, 'image')
		asset.props.favicon = getStringProperty(data, 'favicon')
		asset.props.title = getStringProperty(data, 'title')
	} catch (error) {
		console.error('Unable to load bookmark preview', error)
	}

	return asset
}

function getStringProperty(value: unknown, key: string): string {
	if (!value || typeof value !== 'object') return ''

	const property = Reflect.get(value, key)
	return typeof property === 'string' ? property : ''
}
