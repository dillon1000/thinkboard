# Agentboard

Agentboard is a private, realtime study canvas built with React Router, tldraw, Better Auth, Drizzle, and Cloudflare. Students can place PDFs directly on the canvas, ink over their pages, select work, and discuss it with a durable AI study partner. Canvas changes proposed by the model require explicit approval.

## Development

Requirements:

- Node.js 22.22 or newer
- pnpm 11
- A Cloudflare account for remote bindings and deployment

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

Agentboard accepts sign-in only through a configured generic OAuth/OIDC provider. Copy `.dev.vars.example` to `infra/cloudflare/.dev.vars` and add the provider credentials before starting local development. The provider callback URL is:

```text
http://localhost:5173/api/auth/oauth2/callback/campus-sso
```

Set `TLDRAW_LICENSE_KEY` in the same file for local development and as a Worker secret in production. The public configuration endpoint passes this key to the tldraw client at runtime.

The local app is served by Vite and the Cloudflare Vite plugin. Useful commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm cf-typegen
pnpm db:generate
pnpm deploy
```

## Cloudflare deployment

Create the persistent resources first:

```bash
wrangler d1 create agentboard
wrangler r2 bucket create agentboard-assets
wrangler r2 bucket create agentboard-assets-preview
```

Replace the placeholder D1 `database_id` in `infra/cloudflare/wrangler.jsonc` with the ID returned by Cloudflare. Set a production origin and secrets; the Better Auth secret must contain at least 32 random characters.

```bash
wrangler secret put BETTER_AUTH_SECRET --config infra/cloudflare/wrangler.jsonc
wrangler secret put BETTER_AUTH_URL --config infra/cloudflare/wrangler.jsonc
wrangler secret put OAUTH_DISCOVERY_URL --config infra/cloudflare/wrangler.jsonc
wrangler secret put OAUTH_CLIENT_ID --config infra/cloudflare/wrangler.jsonc
wrangler secret put OAUTH_CLIENT_SECRET --config infra/cloudflare/wrangler.jsonc
pnpm db:migrate:remote
pnpm deploy
```

Native PDF imports also require a Queue, a dead-letter Queue, and a 768-dimensional Vectorize index with indexed `boardId` metadata. See [Native PDF operations](./docs/native-pdf-operations.md) for the provisioning commands and model configuration.

OAuth sign-in is enabled when its discovery URL, client ID, and client secret are all present; without them, the login page shows a configuration notice and exposes no fallback authentication method. Register `https://YOUR_DOMAIN/api/auth/oauth2/callback/campus-sso` with the identity provider. `OAUTH_PROVIDER_ID`, `OAUTH_PROVIDER_NAME`, `OAUTH_SCOPES`, and `AI_MODEL` can be changed in the Wrangler variables.

## Repository structure

```text
agentboard/
├── docs/                         Architecture and product scope
├── infra/cloudflare/             Cloudflare deployment configuration
├── packages/
│   └── shared/                    Browser/Worker contracts with no runtime coupling
├── src/
│   ├── client/
│   │   ├── app/                   Router and application-level boundaries
│   │   ├── features/              Vertical product features
│   │   ├── lib/                   Browser and vendor integrations
│   │   └── styles/                Global styles
│   └── worker/
	│       ├── agents/                Durable AI tutors
	│       ├── auth/                  Better Auth configuration and session gates
	│       ├── db/                    Drizzle schema, client, and repositories
│       ├── durable-objects/       Stateful coordination units
│       └── routes/                Thin HTTP route handlers
└── public/                       Static public assets
```

Feature-specific components, hooks, types, and helpers stay inside their feature. `lib` is reserved for integration code such as browser storage or external clients. A helper should only move into `packages/shared` after both the client and Worker need the same contract.

## Cloudflare resources

- `BoardRoom`: one Durable Object instance per board, using tldraw sync and SQLite
- `StudyAgent`: one Durable Object instance per student/board conversation
- `DB`: D1 metadata and Better Auth tables, accessed through Drizzle
- `AI`: Workers AI model binding
- `TLDRAW_BUCKET`: R2 binding for immutable board assets
- `DOCUMENT_PIPELINE`: Queue binding for PDF OCR and indexing outside the sync path
- `DOCUMENT_VECTORS`: board-filtered Vectorize index for document retrieval
- Static Assets: the built React application

The Worker and browser route paths are defined once in `@agentboard/shared`.

See [the product scope](./docs/product-scope.md) for shipped scope and the next milestones.

## License

The starter infrastructure is covered by [LICENSE.md](./LICENSE.md). The tldraw SDK has its own production licensing requirements.
