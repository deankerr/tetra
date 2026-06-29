# Tetra

Local-first LLM chat app for power users.

## Prototype Mode

The primary goal is rapid design iteration and experimentation, not building a user-facing app.

Dev data is wiped and regenerated as needed. This app is not public. There are has no users.

- NO backwards compatibility shims
- NO migrations - break schemas without hesitation
- NO premature convenience helpers - start with the pure and verbose form before assuming the correct abstraction
- NO premature optimization of code or bundle size
- NO purist git hygiene - all parts of the app are in flux

- Fail fast, throw exceptions, never swallow errors, use console.log/warn/error
- Prefer using existing libraries/solutions over writing our own.
- Lockfile changes are acceptable even if they seem unrelated, do not edit manually.

- Note: the `shiki` wasm warning emitted during build is a known non-issue, do not report it.

## Packages

- `apps/cli` — Bun CLI frontend, should always track the feature set of the web frontend (within reason).
- `apps/web` — TanStack Start web frontend.
- `apps/worker` — Cloudflare Worker and Durable Object sync backend.
- `packages/core` — sessions, runner, tool registry, and UI-agnostic app logic.
- `packages/credentials` — credential registry and localStorage store.
- `packages/schemas` — Tetra TinyBase store definitions, indexes, and row types.
- `packages/tinydb` — typed TinyBase `db`: zod-derived collections, inferred queries, values, and React hooks.
- `packages/tools-exa` — Exa search tool integration.
- `packages/ui` — shadcn/ai-elements component library.

## TinyBase

- TinyBase is explicitly an in-memory Store with tabular rows and cells, where cells can be arrays/objects, and reads return copies rather than network results.
- Its reactivity is listener-based at table/row/cell granularity, not query-cache based like a server DB client.
- The design pressure here is not “normalize because joins are expensive” or “avoid loading related data”, it’s mostly:
  - what changes together,
  - what components need to rerender,
  - what needs an index,
  - what needs to be persisted as a durable artifact.

- Cleaned TinyBase docs: `reference/tinybase-docs` - this is .gitignored, use your bash tool to navigate.
- Inspect the library directly in `{apps|packages}/<name>/node_modules` when a deeper understand of behaviour is necessary.
- TinyBase `store.transaction` batches listener notifications and exposes a transaction log; it is not a persistence or exception-safety boundary.
- `store.transaction` is synchronous and does not use `try/finally`: validate or parse before entering it, and do not put `await` inside it.

### tinydb

`packages/tinydb` wraps TinyBase with a zod-derived `db` handle: per-table collections,
schema-inferred query methods, typed values, `batch`, and a `raw` escape hatch — plus
`./react` hooks. Schemas declare tables + values + indexes via `defineSchema`; `createDb` /
`createMergeableDb` assemble a live `db`.

- Track design notes, gaps, and deferred ideas in `packages/tinydb/README.md`.

## Monorepo

- Bun workspaces with isolated modules.
- Auto-fix lint/format/type-aware issues: `bun run fix`. This is the only check script you should use. Do not use `tsc`.
- Keep package root exports demand-driven. Do not export every internal symbol by default; let real consumers justify the public surface, and run `bun run knip` when tightening exports.
- Review `knip.json` whenever the monorepo package surface is modified, especially when adding or removing packages, package entrypoints, root exports, or test entrypoints.
- Inline disables may be used if the reasoning is justified.
- `sort-keys` is enabled - allow it to re-order object keys.

## TypeScript 6

- `@types/*` packages are manually specified `"types": ["bun"]`, only if required
- Subpath Imports support, e.g. `"#/*": "./dist/*"`, replace deep relative paths `../../utils.js` with `#root/utils.js`

## Project Docs

@VISION.md
@CONTEXT-MAP.md

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `deankerr/tetra`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage labels use the default mattpocock/skills vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Domain docs use a multi-context layout rooted at `CONTEXT-MAP.md`. See `docs/agents/domain.md`.
