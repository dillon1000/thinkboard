# Native PDF operations

The Worker configuration binds the PDF import queue and the document Vectorize index. Provision the resources once per Cloudflare account before the first deploy:

```sh
pnpm wrangler queues create agentboard-document-pipeline
pnpm wrangler queues create agentboard-document-pipeline-dlq
pnpm wrangler vectorize create agentboard-documents --dimensions 768 --metric cosine
pnpm wrangler vectorize create-metadata-index agentboard-documents --property-name boardId --type string
```

The `boardId` metadata index is required. StudyAgent always queries with that filter and also rejects any mismatched result returned by the index.

Apply the checked-in D1 migrations before deploying the Worker:

```sh
pnpm db:migrate:remote
```

OCR and embedding calls use the AI Gateway named by `AI_GATEWAY_ID`. The default configuration uses Cloudflare's `default` gateway, `@cf/meta/llama-4-scout-17b-16e-instruct` for OCR, and `@cf/baai/bge-base-en-v1.5` for 768-dimensional embeddings.
