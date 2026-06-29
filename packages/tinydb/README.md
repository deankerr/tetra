# @tetra/tinydb

A typed `db` handle over a TinyBase store, derived from zod schemas. The flatter,
consumption-shaped successor to the old `@tetra/tinybase-schema` (now deleted): one `db`
per store replaces the `boundStore`/`boundIndexes` split.

> **Status: integrated.** Consumed by `@tetra/schemas`, `@tetra/core`, `apps/cli`,
> `apps/web`, and `apps/worker`. Design rationale lives in `docs/design/tinybase-db-api.md`;
> deferred consumer cleanups in `docs/design/db-migration-followups.md`.

## Shape

```ts
const db = createDb(schema)              // schema = defineSchema({ tables, values, indexes })

db.sessions.get(id)                      // E | null
db.sessions.require(id)                  // E (throws if missing)
db.sessions.all() / .ids() / .has(id)
db.sessions.create(id, data) / .set(id, data) / .update(id, patch) / .delete(id)
db.runs.bySessionNewestFirst(id)         // inferred query method → E[]
db.values.defaultRunConfig.get() / .set(v)
db.batch(() => { … })                    // coalesces writes into one observer event
db.raw.store / db.raw.indexes            // escape hatch for persisters/sync; core never touches it
```

- **Entity = `{ id } & parsed cells`.** `id` is synthetic (joined on read, never stored).
- **`New<E>` = `z.input`** — defaulted cells optional at create, everything else required.
- **Queries are inferred from the schema's `indexes` block.** Method name = index name,
  arg type = the `on` cell's type, return = entities. No hand-written query interfaces.
  `on`/`sort` are constrained to real cell ids and rejected at `defineSchema` otherwise.
- **Reads and writes are split internally** (`CollectionReads`/`CollectionWrites`). That
  seam is what the React module maps over — see below.

## React (`./react`)

```ts
const r = createDbReactApi(schema, db)   // built once at the composition root

r.sessions.useGet(id)                    // reactive E | null
r.messages.useAll() / .useIds() / .useHas(id)
r.runs.useBySessionNewestFirst(id)       // inferred query hook → E[]
r.prompts.useFieldState(id, 'content')   // [value, setValue] two-way field hook
r.values.defaultRunConfig.use() / .useState()
```

**The React surface is `db`'s read surface, derived — not restated.** `ReactDbFor` is a
mapped transform (`Reactify`) over the same `CollectionReads` + inferred `QueriesForTable`
building blocks: every read/query method `use`-prefixed, signature unchanged. Writes and
`batch` are absent for free because they live on the write half the transform never
touches. There is **no parallel React interface** and no per-table/per-method restatement —
the old `StoreReactApi` + `createStoreReactApi` wrapper (two extra hand-maintained copies of
the read surface) are gone. The runtime is a single generic walker over schema tables and
index decls.

Notes:

- **Instance-bound, no Provider.** `createDbReactApi(schema, db)` binds hooks to one `db`
  instance and passes `db.raw.{store,indexes}` as the hooks' trailing arg. This drops the
  old string-id `Provider`/context machinery entirely. The tradeoff: no per-request store
  swapping or SSR-context handoff — fine for a local-first single-store-per-kind app, but
  **revisit at integration** if the web app's SSR/hydration needs context. (The design doc
  sketched a Provider-based `createDbReactApi(schema)`; this is the deliberate simpler
  deviation.)
- **`useRequire` exists but throws in render** — hostile to the tree unless wrapped in an
  error boundary. Reactive reads should lean on the nullable `useGet`.
- **Writes are not mirrored.** Invariant-free field edits use `useFieldState`; writes that
  carry a cascade/invariant go through core commands, never `db.update` from a component.

## Design notes & open wrinkles

Things called out during the build, to revisit during/after integration:

- **`update` is a per-cell field-patch, and that skips object-level zod refinements.**
  It validates each patched cell against `schema.shape[cellId]`, with no whole-row
  read/merge (decision 1b/2c). Consequence: a table-level `.refine()`/`.superRefine()`
  would **not** fire on `update` (it still fires on `create`/`set`, which parse the whole
  row). No current table has such a refinement, so this is latent — but it is a real
  narrowing of "validate" and the most likely thing to bite later. Accept or reconsider
  once a refinement actually exists.

- **The lexical descending comparator is unused by any real index.** Every current index
  sorts by a numeric cell (`createdAt`, `stepNumber`), which takes the numeric path.
  The string/lexical-desc branch (`localeCompare`) is tested but exercised by nothing
  real, and is mildly asymmetric with ascending-lexical (which defers to TinyBase's
  default ordering). Could be dropped until a string-sorted index exists.

- **`raw.store` / `raw.indexes` typing is assertion-based.** `createDb` casts the raw
  TinyBase handles (`as unknown as …`) at the boundary, same as the old package — sound
  in practice but not inference-verified, so emit-type drift wouldn't surface here.

- **`batch` is a grouping primitive, not a transaction.** It coalesces observer events and
  nests (flat-merge), but TinyBase transactions don't roll back on throw — a throw
  mid-batch leaves partial state. No core site relies on rollback.

- **Index ids are namespaced by table (`messages/bySession`).** Method names are
  table-scoped in the schema, but TinyBase index ids are a single global namespace — two
  tables both declaring `bySession` would otherwise clobber each other. `createDb` and the
  React hooks register/read the namespaced id; the method name stays bare. (Found during
  core integration: `messages.bySession` and `steps.bySession` collided.)

- **Mergeable is a separate factory.** `createDb(schema)` → plain store; `createMergeableDb(schema)`
  → `MergeableStore` (sync-capable), typed precisely on `raw.store`. Two functions rather than a
  `{ mergeable }` flag because the raw store _type_ differs and the synchronizer needs it. Not yet
  load-tested against a real synchronizer.

## Layout

Feature files, no grouping dirs:

| File            | Role                                                           |
| --------------- | -------------------------------------------------------------- |
| `schema.ts`     | `defineSchema` + `StoreSchema` type                            |
| `emit.ts`       | zod → TinyBase coarse schema                                   |
| `collection.ts` | `Collection` (reads/writes split) + `makeCollection`           |
| `value.ts`      | `Value` + `makeValue`                                          |
| `query.ts`      | `QueriesForTable` (inferred) + `buildQueries`                  |
| `db.ts`         | `DbFor` type + `createDb` assembly (`./runtime` entry)         |
| `react.ts`      | `ReactDbFor` transform + `createDbReactApi` (`./react` entry)  |
| `types.ts`      | zod aliases, index declarations, entity/new, runtime contracts |

Exports stay demand-driven: `.` is `defineSchema`/`StoreSchema`/`DbFor`/`EntitiesFor`;
`./runtime` is `createDb`; `./react` is `createDbReactApi`/`ReactDbFor`.
