# Agentboard product scope

## Product goal

Create an iPad- and Mac-friendly study canvas that synchronizes in realtime and lets an AI tutor understand, review, and safely modify selected board content.

## Architectural boundaries

- `BoardRoom` is the authoritative coordination unit for one board. It owns tldraw sync state.
- `StudyAgent` owns one user/board conversation. Model latency never blocks board synchronization.
- D1 owns global relational metadata and Better Auth records. Drizzle is the only application database layer.
- R2 owns binary assets and exports.
- Shared packages contain stable contracts, not feature implementations or generic dumping grounds.
- Agent mutations pass through typed, validated board operations and remain user-approvable and undoable.

## Implemented foundation

Shipped:

- Better Auth with an environment-configured generic OAuth/OIDC provider as the only sign-in method
- Drizzle schema and migrations for auth, boards, and memberships
- Private board list, creation, rename, and recoverable archive behavior
- Session and membership checks for APIs, WebSockets, agent instances, bookmark previews, and R2 assets
- SQLite-backed, hibernating tldraw Durable Objects for realtime canvas sync
- A responsive installable PWA shell with online/offline status
- Selection-aware, durably streamed StudyAgent chat
- Semantic rich-text, viewport-shape, binding, and document-clock context for StudyAgent requests
- User-approved review-note, flashcard, and quiz proposals written as typed, interactive tldraw shapes
- Cross-board spaced repetition with due-today reviews for synchronized flashcards
- Student-approved mistake tracking with recurring-pattern context for the tutor
- Direct and Socratic tutoring modes
- Student-paced worked examples, concept maps, and multi-problem practice-set proposals
- Resumable, canvas-native PDF imports with private page images, OCR, semantic retrieval, and tappable page citations
- Unit tests plus local Worker runtime smoke checks

Validated locally:

- Authenticated tldraw and StudyAgent sockets upgrade successfully.
- Unauthenticated board sockets and board-scoped assets return `401`.
- Auth signup, session cookies, board creation, and board listing run against migrated local D1.
- Type checking, unit tests, and production builds pass.

## Next: reliability and semantic context

In scope:

- Multi-device and reconnect E2E suites, including browser sleep and Durable Object eviction
- Vision/OCR only for handwriting, images, or selections that need it
- AI Gateway observability, usage limits, and provider abstraction

Exit criteria:

- A user can select work and ask a question without manually describing the selection.
- Responses identify the board context used and do not read unauthorized boards.
- Long model requests do not affect drawing synchronization.

## Next: stronger action safety and richer interactives

In scope:

- Typed board operation schema with document-clock preconditions
- Persistent suggestion audit records and grouped undo flows
- Additional declarative study interactives extending the shipped flashcard, quiz, walkthrough, concept-map, and review-note shapes
- Server and client schema migrations for every custom shape

Exit criteria:

- Stale or invalid agent patches are rejected safely.
- Every accepted AI change is attributable and reversible.
- Interactives synchronize across devices like normal board records.

## Milestone 4: knowledge and platform hardening

In scope:

- Queue or Workflow processing for backups
- Version history, exports, retention controls, and recovery
- Usage metering, billing boundaries, abuse controls, and operational dashboards
- Collaboration roles and school/privacy readiness if the product expands beyond personal use

## Product expansion roadmap

The first three items are the current product priorities after the core reliability and safety work:

1. **Exam mode.** Let the student select an exam date and a set of spaces or PDFs. Generate a study plan that identifies decks that are behind schedule and repeated mistake patterns, builds a practice exam from the existing quiz and practice-set shapes, and adds the countdown and next study tasks to Today. This feature reuses the current review schedule, mistake tracker, study shapes, PDF retrieval, and Today dashboard.
2. **Shared spaces.** Add email and link invitations with owner, editor, and viewer roles. Membership records, read-only sockets, and live presence already exist in [`schema.ts`](../src/worker/db/schema.ts#L85) and [`index.ts`](../src/worker/index.ts#L176), so the remaining work is mainly invitation management and user interface work. Estimated effort: medium.
3. **Courses and exam dates.** Add a small course model with a color and an exam date. Spaces currently have only a title and an archive state in [`schema.ts`](../src/worker/db/schema.ts#L70). Use course exam dates as goals for adaptive study sessions. Do not add LMS features.

Other planned product capabilities:

- **Cross-space semantic search.** Add a `⌘K` search across spaces, notes, review notes, PDF pages, and flashcards. Search results must open the correct space and select the source shape on the canvas. Reuse document embeddings and add indexes only for content types that do not have them.
- **Handwriting-aware checking.** Use vision or OCR for selected ink when text context is not sufficient. The tutor can check a worked derivation step by step and propose a circle or note on the first incorrect step. The student must approve the annotation before it changes the canvas.
- **Audio and lecture ingestion.** Let a student upload or record audio. Create a timestamped transcript, then use the same retrieval and citation flow as PDF documents. Keep transcription outside the board synchronization path.
- **Teach-it-back interactive.** Add a study shape in which the student explains a concept with text or ink. Grade the explanation against selected source material, cite the evidence, and identify missing or incorrect ideas.
- **Exports.** Export a space to PDF and a flashcard deck to Anki-compatible CSV. Keep the format documented and stable so users can move their work to other tools.

## Explicitly outside the first release

- Arbitrary model-generated JavaScript running in the browser
- General-purpose code execution
- Autonomous agent edits without user-visible policy and undo
- LMS integrations, classrooms, grading, and organization administration
- Full offline editing across browser restarts
- Voice tutoring and multi-agent orchestration

These remain possible extensions, but they should not delay a trustworthy cross-device board and a useful selection-aware tutor.
