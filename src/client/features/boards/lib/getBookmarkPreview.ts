import { apiRoutes } from '@agentboard/shared'
import { AssetRecordType, TLAsset, TLBookmarkAsset, getHashForString } from 'tldraw'
import { z } from 'zod'

const bookmarkPreviewSchema = z.object({
	description: z.string().default(''),
	favicon: z.string().default(''),
	image: z.string().default(''),
	title: z.string().default(''),
})

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

		const data = bookmarkPreviewSchema.parse(await response.json())

		asset.props.description = data.description
		asset.props.image = data.image
		asset.props.favicon = data.favicon
		asset.props.title = data.title
	} catch (error) {
		console.error('Unable to load bookmark preview', error)
	}

	return asset
}
