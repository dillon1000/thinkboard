# PostHog Self-driving setup report

## Summary

PostHog Self-driving has been configured for Agentboard. Session Replay, Error Tracking, Support (Conversations), and GitHub Issues signal sources are enabled; a 7-scout troop (5 built-in + 2 custom) is running daily. Findings will start appearing in your [Self-driving inbox](https://us.posthog.com/project/534484/inbox) within ~30 minutes.

---

## AI data processing

**Approved.** Organization-level AI data processing was approved before this run started.

---

## GitHub

**Connected during this run.**

| Field | Value |
|---|---|
| Integration ID | 193997 |
| Account | dillon1000 |
| Connected | 2026-07-30 |

---

## Products enabled

The `products-enable` tool was not available in this MCP scope. The server flip must be done manually — see Follow-ups. The `posthog.init` call in `src/client/main.tsx` uses `defaults: '2026-01-30'` with no override flags (`disable_session_recording`, `capture_exceptions`), so the server flip will take effect immediately once applied.

| Product | Status | Note |
|---|---|---|
| Session Replay | **Needs manual enable** | Settings → Session Replay → "Record user sessions" |
| Error Tracking | **Needs manual enable** | Settings → Error Tracking → "Enable exception autocapture" |
| Support (Conversations) | **Needs manual enable** | Enable from the product sidebar; tickets only arrive after an inbound channel is connected |

---

## Signal sources

| Source product | Source type | Action | Config ID |
|---|---|---|---|
| `signals_scout` | `cross_source_issue` | **On by default** — no config row needed | — |
| `health_checks` | `health_issue` | **Enabled** | `019fb105-fd35-736d-a18c-959cf2cf2f4c` |
| `error_tracking` | `issue_created` | **Enabled** | `019fb106-0015-7e1f-ba0d-a94e763b528a` |
| `error_tracking` | `issue_reopened` | **Enabled** | `019fb106-04a2-73df-9acc-b81cd32cbbe2` |
| `error_tracking` | `issue_spiking` | **Enabled** | `019fb106-11c4-7fae-92c2-da5513dd252f` |
| `session_replay` | `session_analysis_cluster` | **Enabled** (sample rate 10%) | `019fb106-13a8-7ddf-81f8-c513c3cc74a5` |
| `conversations` | `ticket` | **Enabled** (dormant until inbound channel connected) | `019fb106-16ce-7b27-94f4-8f48d96dd7c3` |
| `github` | `issue` | **Enabled** | `019fb108-46ec-7f7a-b497-98a9226c5519` |
| `llm_analytics` | — | **Skipped** — internal-only, not a user-facing responder |
| `logs` | — | **Skipped** — not a v1 responder |

---

## Connected tools

| Tool | Status |
|---|---|
| GitHub Issues (`dillon1000/agentboard`) | **Connected by this setup** — warehouse source `019fb108-3252-0000-5ebf-19b01f4b77e2`, first sync started. Only the `issues` table is syncing; additional tables can be enabled in the UI. |

---

## Scout troop

**Budget:** 100 runs/day (early access default), 0 used today. Banner: *"Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."*

### Enabled (7 total)

| Scout | Type | Reason enabled |
|---|---|---|
| `signals-scout-general` | canonical | Always on — cross-product correlations and uncovered surfaces |
| `signals-scout-product-analytics` | canonical | 12 custom events; 6 saved funnels/insights (Lock In completion, sign-in-to-board, flashcard engagement) |
| `signals-scout-ai-observability` | canonical | Extensive `$ai_*` event usage via `src/worker/observability/posthogAI.ts` across 6+ worker routes |
| `signals-scout-observability-gaps` | canonical | New project with growing instrumentation — surfaces events with no insight coverage |
| `signals-scout-health-checks` | canonical | New integration — catches SDK and setup issues early |
| `signals-scout-craft-import-health` | **custom** | Watches `craft_whiteboard_imported` for silence while `board_created` stays active |
| `signals-scout-flashcard-study-dropout` | **custom** | Watches `flashcard_answer_checked` → `flashcard_review_completed` completion ratio |

### Disabled (22 total)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by native `error_tracking` source (issues_created/reopened/spiking) |
| `signals-scout-session-replay` | Covered by native `session_replay` source (session_analysis_cluster) |
| `signals-scout-feature-flags` | No feature flag usage found in codebase |
| `signals-scout-surveys` | No surveys in use |
| `signals-scout-revenue-analytics` | No payment SDK or revenue events |
| `signals-scout-experiments` | No A/B experiments running |
| `signals-scout-web-analytics` | App (not a marketing site with UTM/referrer tracking) |
| `signals-scout-web-vitals` | No `$web_vitals` events captured |
| `signals-scout-apm` | No APM/OpenTelemetry spans configured |
| `signals-scout-csp-violations` | No CSP reporting configured |
| `signals-scout-customer-analytics` | B2C app, no group/accounts analytics |
| `signals-scout-data-pipelines` | No CDP destinations or hog flows configured |
| `signals-scout-data-warehouse` | GitHub Issues is the only warehouse source; data-warehouse scout re-enable if more sources are added |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-mcp-tool-calls` | No `$mcp_tool_call` telemetry in this project |
| `signals-scout-replay-vision` | No Replay Vision scanners configured |
| `signals-scout-anomaly-detection` | Insufficient data history on a new project |
| `signals-scout-conversations` | No `$conversation_*` events yet |
| `signals-scout-inbox-validation` | Fresh setup — no resolved reports to validate |
| `signals-scout-insight-alerts` | No insight alerts configured |
| `signals-scout-skills-store` | Not a priority for this project |
| `signals-scout-tasks` | Not applicable |

Re-enable suggestions: `signals-scout-feature-flags` if you add feature flags; `signals-scout-experiments` when you run A/B tests; `signals-scout-surveys` if you launch surveys; `signals-scout-data-warehouse` if you add more warehouse sources.

---

## Custom scouts

### Created

**`signals-scout-craft-import-health`**
- **Watches:** `craft_whiteboard_imported` event going silent while `board_created` activity continues
- **Discriminator:** `craft_whiteboard_imported` last_7d = 0 (or down >70% from prior_7d) while `board_created` last_7d ≥ 3
- **Why no built-in covers it:** `observability-gaps` only flags events without insight coverage; it does not detect domain-integration liveness. `general` sweeps cross-product patterns but won't reliably catch a specific feature going silent.

**`signals-scout-flashcard-study-dropout`**
- **Watches:** `flashcard_review_completed` / `flashcard_answer_checked` completion ratio
- **Discriminator:** ratio drops below 75%, or drops >15 pp week-over-week, with ≥10 `flashcard_answer_checked` events and ≥3 distinct users
- **Why no built-in covers it:** `product-analytics` watches saved funnels for regression; the "Flashcard study engagement" insight is a trends chart, not a funnel — so the per-step dropout ratio between these two events is uncovered.

### Considered and ruled out

| Surface | Filter that killed it |
|---|---|
| Lock In session completion funnel | Saved funnel insight exists; covered by `signals-scout-product-analytics` |
| Sign-in to first board funnel | Saved funnel insight exists; covered by `signals-scout-product-analytics` |
| Inline AI prompt submissions | LLM-trace-level monitoring by `signals-scout-ai-observability` covers this surface |
| Board abandonment ratio | Discriminator too fuzzy; `signals-scout-general` sweeps cross-product correlations |

### Noise escape hatch

If either custom scout proves too noisy, set `emit: false` on its config in PostHog (scout settings) to switch it to dry-run — it keeps running and logging but writes nothing to the inbox until you re-enable it.

---

## Follow-ups

- [ ] **Enable Session Replay** — PostHog project settings → Session Replay → "Record user sessions"
- [ ] **Enable Error Tracking** — PostHog project settings → Error Tracking → "Enable exception autocapture"
- [ ] **Enable Support (Conversations)** — Enable from the PostHog product sidebar (project admin required)
- [ ] **Connect a Conversations inbound channel** — Once Conversations is on, connect an email, inbox, or Slack channel so the `conversations/ticket` source receives tickets (Settings → Conversations)
- [ ] **Wire source-map upload** — Add `posthog-cli sourcemap` or your bundler's upload step to CI so production stack traces de-minify in error tracking
- [ ] **Add env vars to `.env.example`** — Document `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` for collaborators
- [ ] **Enable more GitHub warehouse tables** — The issues sync is live; additional tables (pull requests, commits) can be added in PostHog → Data Warehouse → Sources

---

## What happens next

The scout coordinator picks up the 7 enabled scouts within ~30 minutes and fires the first round of runs. Each run draws from the project's 100 runs/day early-access budget. Scouts that find nothing close empty (a real outcome); scouts that find something file a report to the [Self-driving inbox](https://us.posthog.com/project/534484/inbox). Immediately-actionable reports can start coding tasks directly from the inbox.
