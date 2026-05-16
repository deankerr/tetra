# 04 — Implementation Tracker

Tracks the state of `packages/core` against the inference model design.

---

## Implemented

### Data model (`model.ts`, `store.ts`)

- All four tables: `sessions`, `messages`, `requests`, `steps`
- All four indexes: `messagesBySession`, `stepsByMessage`, `requestsBySession`, `requestByAssistantMessage`
- Domain types derived from `Row<Schema, TableName>` — zero schema drift possible
- `ModelConfig` validated with Zod at execution boundary
- HLC ID generators for all entity types
- `sessions.config` — stored as `AnyObject`, read+parsed via `sessions.getConfig()` with `DEFAULT_MODEL_CONFIG` fallback

### Durable backend (`runner.ts`)

- `onStepFinish` → TinyBase is the only write boundary (Invariant 2 ✓)
- `steps.responseMessages` written verbatim from AI SDK (Invariant 3 ✓)
- Step rows written once, never updated (Invariant 4 ✓)
- `store.transaction()` wraps step write + `messages.parts` cache update atomically
- `accumulatedContent` accumulated across steps for the rendering cache
- `result.totalUsage` → `requests.totalUsage` on stream drain
- Abort/error paths both handled; partial step rows retained
- `step.usage` spread (`{ ...step.usage }`) to capture all SDK-provided fields

### Session + history API (`sessions.ts`)

- Full CRUD: create, delete, rename, get, list
- Config API: `getConfig` (parse + fallback), `setConfig` (persist), `create` accepts initial config
- `execute(sessionId, content, config?)` merges session config with caller overrides before parsing
- Message API: addMessage, getMessage, getMessages, setMessageParts
- `setMessageParts` uses `setPartialRow` — single atomic mutation (Invariant 4 ✓)
- `gatherModelMessages` reads `steps.responseMessages` for assistant turns (not `messages.parts`)
- `maxMessages` window slicing applied before history reconstruction

### Request lifecycle

- Status machine: `streaming → completed | error | cancelled` ✓
- `recover()` marks stale streaming requests as error on startup ✓
- `AbortController` map for in-flight cancellation ✓
- Request row written synchronously before async stream starts ✓

### CLI (`cli.ts`)

- `sessions`, `new`, `history`, `chat` commands via Commander
- SQLite persistence across invocations via `createSqliteBunPersister`
- `chat` streams output at step-boundary granularity by listening to `messages.parts` cell
- `--model` / `--system` flags are opt-in overrides; unset flags defer to session config

---

## Partial

### `step.usage` raw cost data

We spread `{ ...step.usage }` to capture all fields the SDK provides. However, the AI SDK v6 `LanguageModelUsage` type only declares `inputTokens`, `outputTokens`, `totalTokens` — there is no typed `raw` field. OpenRouter cost data lives in `step.providerMetadata` (already stored as `steps.providerMetadata`), accessible at `providerMetadata.openrouter.usage.cost`. Per-step cost is queryable from there; a convenience `raw` on usage is not yet needed.

### `step.model`

Design specifies `{ provider: string, modelId: string }`. We store `step.model ?? {}` (whatever the AI SDK provides). Untested whether the shape matches the spec.

---

## Not implemented

### Live stream path

The design's second execution path is entirely absent:

- `result.toUIMessageStream()` — not called
- `processUIMessageStream` — not wired
- `StreamingState` Map — not created
- `useSyncExternalStore` hook — not applicable in core (React concern), but the Map itself belongs here

The CLI works around this with step-granularity TinyBase listeners, which is acceptable for a dev tool. The web app will need per-token rendering.

### Tools

No tool registry, no tool execution loop, no tool result rendering. The `streamText` call has no `tools` or `maxSteps` parameter.

### OPFS persistence

The web app will need `createOPFSPersister`. The CLI uses SQLite (`createSqliteBunPersister`). No shared persistence abstraction exists yet.

### React layer

`StreamingState`, `useSyncExternalStore`, and the `useMessage` switching hook (`streaming ?? completed`) are all future web app concerns. Not a `packages/core` concern per se, but nothing exports the live stream for a React consumer to hook into.

---

## Divergences from the design

### Package topology

The design splits into `packages/inference` (streaming + persistence loop) and `packages/runtime` (thin session/request coordinator). We merged both into `packages/core/runner.ts`. This was an intentional cleanroom decision — the split can happen later when the boundary is clearer.

### `getApiKey` injection instead of credentials package

Design assumed `packages/credentials` (localStorage-backed). We inject `getApiKey: () => string` into `createRunner`. The CLI passes `() => process.env.OPENROUTER_API_KEY`; a browser consumer would pass `() => getCredential('openRouterApiKey')`. Cleaner separation — no browser-only dep in core.

### CLI config is always an explicit partial

The design implied config comes entirely from the session. In the CLI, flags are opt-in overrides that merge with the session config at execute time. This is intentional — the CLI needs a way to override model/system without persisting the change to the session.

---

## Open questions

1. **When does the live stream path land?** It's required for sub-step token rendering in the web app. The `StreamingState` Map and the `toUIMessageStream` wiring belong in `runner.ts`. Should it be gated behind a flag, or does adding it break the CLI in any way?

2. **Package split?** Keep as `packages/core` indefinitely, or split into `inference` + `runtime` once the live stream path exists and the seam is clear?

3. **`step.model` shape?** Verify at runtime that `step.model` from the AI SDK matches `{ provider, modelId }` as the design specifies.
