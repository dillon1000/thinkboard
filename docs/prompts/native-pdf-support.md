# Agent prompt: native first-class PDF support for Agentboard

Copy everything below this line into the implementing agent's prompt.

---

You are implementing native, first-class PDF support in **Agentboard**, an iPad- and Mac-friendly study canvas (tldraw) with realtime sync and an AI tutor (StudyAgent). Work in the repo root. Read `docs/product-scope.md` first — respect its architectural boundaries, especially: D1 owns relational metadata via Drizzle only, R2 owns binaries, agent mutations stay typed/approvable/undoable, and model latency must never block board sync.

**Core design decision (non-negotiable):** PDFs live *on the canvas* as page shapes the student can ink over, select, and ask the tutor about — the same interaction model as every other board object. Do not build a separate side-panel PDF viewer.

**Existing patterns to follow:**
- Custom study shapes and their Zod proposal schemas: `packages/shared/src/studyShapes.ts`, client rendering in `src/client/features/study/`
- Membership-scoped R2 asset route: `src/worker/routes/assets.ts`
- Drizzle schema and migrations: `src/worker/db/schema.ts`, `drizzle.config.ts`
- Agent selection context: `src/worker/agents/canvasContext.ts` and `packages/shared/src/canvasContext.ts`
- Board sync DO: `src/worker/durable-objects/BoardRoom.ts`; Wrangler config: `infra/cloudflare/wrangler.jsonc`
- Match repo conventions: no `any`, shared contracts go in `packages/shared`, unit tests colocated as `*.test.ts`, verify with `pnpm typecheck`, `pnpm test`, `pnpm build`

Implement the five steps below **in order**, as separately shippable phases. Commit at each phase boundary with passing typecheck/tests/build.

## Step 1 — Storage and metadata

- Store the original uploaded PDF in R2 under a board-scoped key; it is the permanent source of truth.
- Add Drizzle tables: `documents` (id, boardId, ownerId, title, r2Key, pageCount, byteSize, status: `processing | ready | failed`, createdAt) and `document_pages` (documentId, pageNumber, imageR2Key, extractedText, width, height, ocrApplied). Generate and check in the migration.
- Add upload/list/delete routes under the existing board routes, enforcing the same session + board-membership checks used by `src/worker/routes/assets.ts`. Serve page images and the original PDF only through membership-checked routes — never public URLs.
- Enforce caps at upload time: max file size 50 MB, max 200 pages; reject with typed error responses.

## Step 2 — Import pipeline

- **Client side (import time):** on PDF drop/pick, render each page to a bitmap with pdf.js at ~2x display resolution and extract the text layer per page. Upload original PDF + page images + per-page text to the Worker. Show per-page progress; imports must be resumable or cleanly restartable if the tab closes mid-import.
- **Server side (async):** add a Cloudflare Queue consumer (or Workflow) that runs after upload completes: for pages whose extracted text is empty/near-empty (scanned pages), run OCR via a Workers AI vision model — vision only where needed, per product scope. Then chunk page text (~500–800 tokens, page-aligned; never merge chunks across pages) and embed into **Vectorize**, with metadata `{boardId, documentId, pageNumber}` on every vector.
- Update `documents.status` as the pipeline progresses; surface `failed` states to the client with a retry action.
- Bind the queue/Vectorize index in `infra/cloudflare/wrangler.jsonc`.

## Step 3 — Canvas representation

- Add a custom tldraw shape `pdf-page` in `packages/shared` + `src/client/features/study/`, following the existing custom-shape pattern: props are `{documentId, pageNumber, w, h}` — never embed image bytes or extracted text in shape props.
- The shape lazy-loads its page image through the authorized asset route, renders beneath ink (locked aspect, not erasable by drawing tools), and behaves as a normal synced tldraw record so multi-device sync, selection, and undo work unchanged.
- On import completion, place all pages inside a frame in a vertical column (consistent gutter), inserted near the current viewport without overlapping existing content.
- Register server + client schema migrations for the new shape, as required by product scope for every custom shape.

## Step 4 — Agent integration

- **Selection context:** when a selection overlaps `pdf-page` shapes, extend the existing canvas-context flow (`src/worker/agents/canvasContext.ts`, `packages/shared/src/canvasContext.ts`) to include the extracted text of the intersected page region alongside the existing selection image. Keep the existing text-length cap behavior.
- **Retrieval:** give StudyAgent a retrieval step that queries Vectorize **filtered by the current boardId** for document-grounded questions ("quiz me on chapter 3"). The boardId filter is a hard security requirement: the agent must be provably unable to retrieve content from other boards. Add a test asserting cross-board retrieval returns nothing.
- **Citations:** answers grounded in retrieved chunks must cite `{documentTitle, pageNumber}`. Render citations in the chat UI as tappable links that pan/zoom the tldraw camera to the cited `pdf-page` shape.
- Document-derived proposals (quizzes, flashcards) continue through the existing typed, user-approved proposal flow in `packages/shared/src/studyShapes.ts` — no new mutation path.

## Step 5 — Guardrails and operations

- Per-user quotas: max stored PDF bytes and max pages processed per day; enforce in upload route and pipeline, with typed quota-exceeded errors the client renders helpfully.
- Route OCR/embedding model calls through the project's AI Gateway configuration (if not yet configured, add the binding and a config stub consistent with `src/worker/config.ts`).
- Deleting a document cascades: R2 objects (original + page images), D1 rows, and Vectorize vectors. Archiving a board must make its documents unretrievable by the agent.
- Log pipeline stage timings and failure causes; add a lightweight status endpoint for a document's processing state.

## Verification (every phase)

`pnpm typecheck && pnpm test && pnpm build` must pass. For phases touching runtime behavior, validate against local Worker runtime (`wrangler dev --config infra/cloudflare/wrangler.jsonc`): authenticated upload succeeds, unauthenticated document/page-image requests return 401, and board sync latency is unaffected during pipeline processing.

## Out of scope

PDF text editing or re-export, side-panel viewers, cross-board document libraries, arbitrary model-generated code, and autonomous (unapproved) agent edits.
