import type { StudyArtifactInput } from '@agentboard/shared'
import { z } from 'zod'
import { getDocumentAIConfig } from '../config'
import type { AIRunner } from '../observability/posthogAI'

const EMBEDDING_BATCH_SIZE = 50
const embeddingResponseSchema = z.object({ data: z.array(z.array(z.number())) })

/**
 * Adds accepted canvas text to the same embedding index as PDFs. Vector IDs are deterministic
 * hashes, so an edit replaces the prior value and a canvas deletion can remove it without D1 state.
 */
export async function indexStudyArtifacts(
	env: Env,
	boardID: string,
	artifacts: readonly StudyArtifactInput[]
) {
	if (!artifacts.length) return
	const config = getDocumentAIConfig(env)
	for (let offset = 0; offset < artifacts.length; offset += EMBEDDING_BATCH_SIZE) {
		const batch = artifacts.slice(offset, offset + EMBEDDING_BATCH_SIZE)
		// SAFETY: Env.AI implements this JSON subset through Cloudflare's model overloads.
		const response = await (env.AI as AIRunner).run(
			config.embeddingModel,
			{ text: batch.map(({ text, title }) => `${title}\n${text}`.slice(0, 8_000)) },
			{
				gateway: {
					id: config.gatewayID,
					metadata: { boardID, pipeline: 'artifact-index' },
				},
			}
		)
		const embeddings = readEmbeddings(response)
		if (embeddings.length !== batch.length) {
			throw new Error('Artifact embedding response size did not match the request')
		}
		const vectorIDs = await Promise.all(batch.map(({ shapeID }) =>
			createArtifactVectorID(boardID, shapeID)
		))
		await env.DOCUMENT_VECTORS.upsert(batch.map((artifact, index) => ({
			id: vectorIDs[index],
			metadata: {
				artifactKind: artifact.kind,
				boardId: boardID,
				chunkText: artifact.text.slice(0, 4_000),
				resultKind: 'shape',
				shapeId: artifact.shapeID,
				title: artifact.title,
			},
			values: embeddings[index],
		})))
	}
}

export async function removeStudyArtifactVectors(
	env: Env,
	boardID: string,
	shapeIDs: readonly string[]
) {
	if (!shapeIDs.length) return
	const vectorIDs = await Promise.all(shapeIDs.map((shapeID) =>
		createArtifactVectorID(boardID, shapeID)
	))
	await env.DOCUMENT_VECTORS.deleteByIds(vectorIDs)
}

export async function createArtifactVectorID(boardID: string, shapeID: string) {
	const bytes = new TextEncoder().encode(`${boardID}\u0000${shapeID}`)
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
	const encoded = btoa(String.fromCharCode(...digest))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '')
	return `artifact:${encoded}`
}

function readEmbeddings<Value>(value: Value): number[][] {
	const parsed = embeddingResponseSchema.safeParse(value)
	if (!parsed.success) throw new Error('Embedding response did not contain vectors')
	return parsed.data.data
}
