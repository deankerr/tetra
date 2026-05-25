# Tetra

Local-first LLM chat app for power users.

## Prototype Mode

The primary goal is rapid design iteration and experimentation, not building a user-facing app.

Dev data is wiped and regenerated as needed. This app is not public. There are has no users.

- NO backwards compatibility shims
- NO migrations - break schemas without hesitation
- NO accessibility or mobile UI support
- NO premature optimization of code or bundle size
- NO purist git hygiene - all parts of the app are in flux

- Fail fast, throw exceptions, never swallow errors, use console.log/warn/error
- Prefer using existing libraries/solutions over writing our own.
- Lockfile changes are acceptable even if they seem unrelated, do not edit manually.

## Packages

- `@tetra/cli` — Bun CLI frontend, should always track the feature set of the web frontend (within reason)
- `@tetra/core` — store schema, sessions, runner, tool registry. UI-agnostic.
- `@tetra/credentials` — credential registry and localStorage store.
- `@tetra/ui` — shadcn/ai-elements component library.
- `@tetra/tinybase-schema` — typed TinyBase schema, store, index, and React wrappers.
- `@tetra/sdk-probe` — scratch space for AI SDK experiments.

## TinyBase

The TinyBase repo is cloned as a submodule in `reference/tinybase`.

- TinyBase is explicitly an in-memory Store with tabular rows and cells, where cells can be arrays/objects, and reads return copies rather than network results.
- Its reactivity is listener-based at table/row/cell granularity, not query-cache based like a server DB client.
- The design pressure here is not “normalize because joins are expensive” or “avoid loading related data”, it’s mostly:
  - what changes together,
  - what components need to rerender,
  - what needs an index,
  - what needs to be persisted as a durable artifact.

### TinyBase Schema

`packages/tinybase-schema` wraps TinyBase with zod-derived table, value, index, and React APIs. Keep it close to TinyBase's API first, and let concrete app usage justify any more opinionated helpers.

- Define Tetra store shape in `@tetra/core` with `defineTypedTinybase`, `tinybaseTable`, `tinybaseCell`, and `tinybaseIndex`.
- Prefer `db.tables.*`, `db.tables.getValue`, typed indexes, and typed React hooks over raw TinyBase calls in app code.
- Use raw `store`/`indexes.raw` only for TinyBase integration points such as persisters, providers, or APIs the wrapper intentionally does not cover yet.
- Tetra's core schema does not rely on TinyBase native defaults or row-dropping validation. If a value needs a fallback, make that fallback explicit at the read or creation site.
- Track wrapper design notes, gaps, and deferred ideas in `packages/tinybase-schema/README.md`.

## Sync & Persistence

`createTetraDb({ mergeable })` in `@tetra/core` creates either a plain `Store` or a `MergeableStore` depending on the caller's needs. Both return the same typed API — the sync layer is invisible to business logic.

**Web app** (`apps/web`) — mode selected by `VITE_TETRA_DATA_MODE`:

- `memory`: plain in-memory `Store`, no persistence
- `local`: plain `Store` + IndexedDB persister (`tetra-local`)
- `sync`: `MergeableStore` + `WsSynchronizer` to the Cloudflare Durable Object at `VITE_WORKER_URL/tetra`

**CLI** (`apps/cli`) — mode selected by `--local` flag (default: sync):

- `sync` (default): `MergeableStore` + `WsSynchronizer` to `TETRA_WORKER_URL/tetra` + JSON SQLite local cache (`tetra-sync-cache.db`)
- `--local`: plain `Store` + tabular SQLite (`tetra-redesign.db`) — one SQL table per TinyBase table, no sync

**Worker** (`apps/worker`) — Cloudflare Worker + Durable Object. The DO extends `WsServerDurableObject` and persists to its own SQLite via `createDurableObjectSqlStoragePersister`. Deploy: `bun run --filter @tetra/worker deploy`.

**Reset commands** — prototype data can be hard-erased instead of relying on TinyBase schema validation to drop invalid rows:

- Web local data: bug menu -> "Clear all data", or the root error screen's "Clear all data" action. This deletes the `tetra-local` IndexedDB database and reloads.
- Synced DO data: set `TETRA_RESET_TOKEN` locally and as a Wrangler secret, then run `bun run --filter @tetra/cli start reset-sync --yes`. Localhost worker resets are allowed without a token only when the worker has no token configured.

**Dump command** — snapshots the live DO store into a local tabular SQLite for SQL inspection without touching normal runtime state:

```bash
bun run --filter @tetra/cli start -- dump [--db path] [--settle ms]
```

See `docs/sync-architecture.md` for design notes and future directions (per-session DOs, session index).

## Monorepo

Bun workspaces. Run scripts from the root.

- Auto-fix lint/format/type-aware issues: `bun run fix`. This is the only check script you should use. Do not use `tsc`.
- App-specific scripts: `bun run --filter <name> <script>`, e.g. `bun run --filter @tetra/web dev`

## Linting

- The ruleset is strict and type-aware via Ultracite/Oxlint.
- Inline disables are allowed only when the local reason is written in the disable comment.
- `sort-keys` is enabled; let tooling reorder object keys.

## TypeScript 6

- `@types/*` packages are manually specified `"types": ["bun"]`, only if required
- Subpath Imports support, e.g. `"#/*": "./dist/*"`, replace deep relative paths `../../utils.js` with `#root/utils.js`

## Seeding the database

When working in an isolated worktree or without an API key, load bundled seed sessions so you have real data to work with:

```bash
# CLI (SQLite)
bun run --filter @tetra/cli start seed

# Web — open the app, click the bug icon (bottom-left), choose "Load seed data"
```

## Project Docs

@VISION.md
