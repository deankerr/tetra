# tinybase-schema: consumer `db` API — design exploration

**Status:** API design settled (steps 1–5 decided; step 6 = intentions, confirm while building). Implementation not started.
**Scope:** the typed handle that `@tetra/tinybase-schema` hands to its main consumer (`@tetra/core`).
**Related:** `packages/tinybase-schema/README.md` (current API), `packages/core/CLAUDE.md`.

## Why

`core` is the main consumer of the store, but today it receives a `StoreInstance`
(`{ id, definition, rawStore, rawIndexes, boundStore, boundIndexes }`) and immediately
discards four of six fields — every module does `this.boundStore = libraryStore.boundStore`.
The shape we hand the main consumer is built for a different consumer (the composition
root, which needs `raw*` for persistence/sync).

Three frictions repeat at every call site (grounding snippets in the appendix):

- **`.tables.` is noise** — `boundStore.tables.sessions.requireEntity(id)`.
- **indexes return id-lists that get re-hydrated** — `boundIndexes.getSliceRowIds('runsBySessionNewestFirst', id).map(id => boundStore.tables.runs.requireEntity(id))`.
- **`transaction` is a bolt-on** — a callback batcher sitting next to tables/values; inside it you keep writing through the same store handle.

**Direction of travel.** The current system was built bottom-up: "we want typed object
fields" → schema → stores → indexes → container → whatever API fell out. That was fast
and got us a working app. Now we redesign in the opposite direction: fix the _ideal API_
first, then walk backwards through the build steps it implies — using the existing app as
scaffold and evidence so we're confident in what we're building.

## Design principles

- **API before implementation.** Design the shapes `core` works with first. How they're built, and how they fit initialisation / persisters / sync, is a separate problem — parked. We're confident any shape is buildable in TypeScript, so "how" must not constrain "what."
- **Build what we want, not what TinyBase says.** No obligation to TinyBase's vocabulary (slices, cells, transactions) or patterns. Pick the names and shapes that read best for `core`.
- **No drop-in / blast-radius pressure.** Today's code is a rough guide, not a constraint. The app is the right size to change freely.
- **Raw is not core's concern.** `db` replaces `boundStore`/`boundIndexes`; `core` never needs a raw escape hatch, so raw must not shape the main API. (Where raw lives is an implementation/initialisation question — parked.)
- **React is deferred, not denied.** It exists and will consume something; we just don't design it yet.

## Target API (consumption)

Two axes, not a flat list of features. **Shapes** (the entity — one row+id; the
collection — a set of entities; the value — a singleton) run down; **capabilities**
(read-one, read-many, write, group) run across. A _query_ isn't its own shape — it's a
collection produced by a filter/sort. The **entity is the universal currency**: it falls
out of every read and feeds into every write. The asymmetry that matters: **writes address
only by id on a collection; reads address by id _and_ by query.**

```ts
// The root — a record of collections + values + a group verb. No tables/values nesting, no transaction.
interface LibraryDb {
  sessions: Collection<Session>
  messages: Collection<Message> & MessageQueries
  runs: Collection<Run> & RunQueries
  steps: Collection<Step> & StepQueries
  prompts: Collection<Prompt>
  values: LibraryValues
  batch(fn: () => void): void
}

// One shape, all collections. Entity = { id } & cells; New<E> = the writable cells (no id).
interface Collection<E> {
  get(id: string): E | null
  require(id: string): E // throws if missing
  has(id: string): boolean
  all(): E[]
  ids(): string[]
  create(id: string, data: New<E>): void // New<E> = z.input; throws if id exists
  set(id: string, data: New<E>): void // upsert / overwrite
  update(id: string, patch: Partial<New<E>>): void // field-patch; throws if missing
  delete(id: string): void
}

// Queries = named reads that yield collections. Return ENTITIES, not ids.
interface RunQueries {
  bySessionNewestFirst(sessionId: string): Run[]
  byTargetMessageNewestFirst(messageId: string): Run[]
}

interface Value<T> {
  get(): T
  set(v: T): void
  clear(): void
}
```

Two TinyBase-isms dropped on purpose: **`cell`/`setCell`** (core only used `setCell` to
touch `updatedAt` — `update(id, { updatedAt })` covers it) and the **table/value/transaction
nesting** (collections are top-level; `batch` is the only verb).

### Core, rewritten

```ts
// appendMessage
db.batch(() => {
  db.messages.create(messageId, { parentMessageId, parts, role, sessionId: this.id, createdAt: now, updatedAt: now })
  db.sessions.update(this.id, title === null ? { updatedAt: now } : { title, updatedAt: now })
})

// deleteMessage — index→entity dance gone, no .tables. noise
db.batch(() => {
  for (const run of db.runs.byTargetMessageNewestFirst(message.id)) {
    for (const step of db.steps.byRun(run.id)) db.steps.delete(step.id)
    db.runs.delete(run.id)
  }
  for (const step of db.steps.byMessage(message.id)) db.steps.delete(step.id)
  db.messages.delete(message.id)
  db.sessions.update(this.id, { updatedAt: now })
})

// export
{ runs: db.runs.bySessionNewestFirst(this.id), steps: db.steps.bySession(this.id) }

// reads
db.sessions.require(this.id)
db.prompts.require(systemPromptId).content
```

## Decisions

- **D1.** `db` lives in `@tetra/tinybase-schema`.
- **D2.** API-design first; implementation considered but not committed.
- **D3.** `db` fully replaces `boundStore`/`boundIndexes`. Raw is out of `db` and out of core's design entirely.
- **D4.** The target API above (shapes × capabilities) is the agreed surface.

### Resolved — steps 1–2 (entity & collections)

- **Writes return `void`.** No core call site uses a write's return; returning the entity is unused and (for `update`) would force a read. (1b)
- **`New<E>` = zod `input`.** Defaulted fields optional at create, everything else required — "required unless a default is declared." Only `sessions.config` is affected today. (1a)
- **`update` is a field-patch.** Existence-check → validate the patched fields → write those cells. No whole-row read/merge. (1b, 2c)
- **`create` rejects an existing id; `set` upserts.** `create` for generated ids (all core library writes); `set` for overwrite-by-external-id (catalog refresh, read-modify-write). (2a)
- **id is synthetic.** Entity = `{ id } & cells`; the wrapper joins id + cells on read, never stored as a cell. (1c)
- **Relations live in queries, not entities.** Entities stay flat cells. (1d)
- **Reads fail loud, all-or-nothing.** Parse on read; a failure throws. One bad row throws the whole list/query read (acceptable for prototype mode). (2b, 2c)

### Resolved — step 3 (queries)

- **Declared in the schema, table-scoped.** An `indexes` block on `defineStoreSchema`, generating entity-returning methods on the owning collection (`db.runs.bySessionNewestFirst(id): Run[]`):
  ```ts
  indexes: {
    messages: { bySession: { on: 'sessionId', sort: 'createdAt' } },
    runs: {
      bySessionNewestFirst:       { on: 'sessionId',       sort: 'createdAt', desc: true },
      byTargetMessageNewestFirst: { on: 'targetMessageId', sort: 'createdAt', desc: true },
    },
    steps: {
      byMessage: { on: 'messageId', sort: 'createdAt' },
      byRun:     { on: 'runId',     sort: 'stepNumber' },
      bySession: { on: 'sessionId', sort: 'createdAt' },
    },
  }
  ```
- **`{ on, sort?, desc? }` is the whole vocabulary** — covers 100% of current indexes. Numeric-vs-lexical comparison is _derived from the sort cell's zod type_, so the hand-written `Number()` comparators disappear. No escape hatch in v1; add `compare:` / multi-key / function-`on` only when a real index needs it. (3b)
- **Slice-arg typed from the `on` cell** — `bySession(sessionId: string)`. (3c)
- **Always returns a list** (`E[]`); no unique/single-result index exists yet — add an `E | null` variant if one appears. (3d)
- **Returns entities, not ids.** (3e)
- **Single plain-cell keys only**; composite/derived keys deferred. (3f)

### Resolved — step 4 (values)

- **`Value<T>` is `{ get(): T; set(v: In<T>): void }`** — `get` returns output, `set` takes input and returns void (consistent with collection writes). (4b)
- **No `clear`.** A value with a schema default has no absent state — `get` always returns a set value or the default — so a "clear" could only mean reset-to-default, and nothing uses it (the cli writes `set(null)` explicitly). Add `reset()` only if a non-null default ever needs it. (4a)

### Resolved — step 5 (batch)

- **`batch(fn)` coalesces writes into one observer event — NOT atomic.** TinyBase transactions don't roll back on throw and we're not building that; a throw mid-batch leaves partial state. It's a grouping primitive, not a transaction. No core site relies on rollback. (5a)
- **Nests, flat-merge.** Required: `deletePrompt`'s batch wraps `unlinkPrompt`'s. (5b)
- **Single-store**; no cross-store grouping. (5c)
- **Core declares the boundary; observers reap it.** Core reads synchronously and gains nothing from batching — the payoff is for persisters, synchronizers, and (later) React. Concentrated in catalog refresh (hundreds of writes → one event) and cascades (no transient inconsistent view); 2-write touches benefit marginally. Only core can mark which writes form one logical change, so `batch` lives on `db` regardless.

### Cross-cutting (settled implicitly through the design)

- **Reads return snapshots, not live references.** `get`/`all`/queries hand back parsed copies; mutating a returned entity does nothing — change data through writes. (Inherited from copy-on-read; we're not building live proxies.)
- **Writes fail loud too.** `create`/`set`/`update` and value `set` parse their input and throw on invalid — the write-side mirror of fail-loud reads.
- **A query's method name is its declared index name.** The author-chosen key in the schema's `indexes` block surfaces verbatim (`bySessionNewestFirst`), so index names must read as method names.
- **`all()` / `ids()` return insertion order.** Any other order is a query's job — declare an index. The unfiltered read makes no ordering promise beyond insertion.

## Intentions — step 6 (container & assembly)

Softer than the decisions above: recorded as **intentions to confirm while building**, because
this is the seam where the type machinery gets real and the shape will want to flex.

**The bridge** — schema (now carrying indexes) → `createDb` → a live `db` that is the clean
API plus a `raw` hatch on the side:

```ts
const library = createDb(librarySchema)                      // in-memory
const library = createDb(librarySchema, { mergeable: true }) // sync-capable

library.sessions.require(id)        // core lives here
library.batch(() => { … })
library.raw.store                    // persisters & synchronizers
library.raw.indexes                  // only the (deferred) React Provider wants this

createCore({ library, catalog })     // core gets db; never touches .raw
```

- **6a. `db.raw.{store, indexes}`** — the only escape hatch; core never touches it. (intention: yes)
- **6b. Factory shape** — `createDb(schema, { mergeable })` vs two functions — **deferred**, decide while building.
- **6c. No `id` on `db`** — it only fed React provider naming / persister labels, both chosen elsewhere; drop it until React needs it.
- **6d. No-index stores degrade** — an index-less schema yields collections + values + batch, no query methods; `raw.indexes` present but empty.
- **The `definition` layer dissolves** — indexes move into the schema, so `defineStoreDefinition` + `applyIndexes` + the `indexIds` tuple all go; `createDb(schema)` is the whole assembly.

**Implementation phase owns** (inside `createDb`): emit TinyBase schemas → create raw (plain/mergeable) store → create + apply declared indexes → build collections and bind query methods → assemble `db`. Plus persister/sync/init wiring, which stays at the composition root over `raw.store`.

## Package surface

The clean API collapses the export surface from 17 to ~3 (plus the deferred React entry).

**`.` — schema definition + types** (schema authors and core; no store runtime)

```ts
export function defineStoreSchema(def): StoreSchema   // tables + values + indexes
export type DbFor<Schema>                             // → LibraryDb (core's handle type)
export type EntitiesFor<Schema>                       // → { messages: Message, runs: Run, … }
```

**`./runtime` — assembly** (composition root; pulls the TinyBase runtime)

```ts
export function createDb(schema, opts?): DbFor<typeof schema> // opts.mergeable for sync
```

**`./react` — deferred.** `createDbReactApi(schema)` + provider helpers; shape sketched in § React below.

**What dissolved:**

| Today                                                                               | Becomes                                                                                 |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `defineStoreDefinition` + `applyIndexes` + `indexIds` tuple                         | folded into `defineStoreSchema`                                                         |
| `createStoreInstance` + `createMergeableStoreInstance`                              | `createDb(schema, { mergeable })`                                                       |
| `BoundStoreFor` + `BoundIndexes` + `StoreInstanceFor` + `MergeableStoreInstanceFor` | `DbFor`                                                                                 |
| `StoreRowsFor`                                                                      | `EntitiesFor`                                                                           |
| `RawIndexesFor`, `TinybaseSchemasFor`                                               | gone — raw reached via `db.raw.{store,indexes}`, or named as `DbFor<…>['raw']['store']` |

**Notes:**

- The `.` / `./runtime` split is conceptual, not bundling: schema packages name `DbFor`/`EntitiesFor` types but never call `createDb`, so they don't depend on the store runtime. Soft — could merge.
- `raw` adds nothing to the type surface — it's reached through the value or `DbFor<…>['raw']`.

## React (deferred — intended shape)

Not built until the core `db` lands; recorded so the shape isn't re-derived later.

**The React API is `db`'s read surface — every method `use`-prefixed and reactive — plus two
two-way state hooks.** Writes are not mirrored (they're imperative, via core commands), so
there are no `useCreate`/`useUpdate` hooks.

| `db` (imperative)                  | React (reactive)                     |
| ---------------------------------- | ------------------------------------ |
| `db.sessions.get(id)`              | `r.sessions.useGet(id)`              |
| `db.messages.all()`                | `r.messages.useAll()`                |
| `db.runs.bySessionNewestFirst(id)` | `r.runs.useBySessionNewestFirst(id)` |
| `db.values.jsonView.get()`         | `r.values.jsonView.use()`            |
| writes / `batch`                   | —                                    |

- **The two-way hooks are the only `[value, setter]` hooks, and React's only direct-write path:** `useFieldState(id, field)` (setter = `db.table.update(id, { field })`) and `values.X.useState()` (setter = `set`). `useCellState` → `useFieldState` (no "cell" in the vocab).
- **Two write paths, split by invariant.** Invariant-free field edits (e.g. `prompts.content`) use a two-way hook; writes carrying an invariant/cascade (e.g. a message edit touching `session.updatedAt`) go through a core command. Components never call `db.update` directly.
- **`require` in render is hostile** — a fail-loud throw crashes the tree — so reactive reads lean on the nullable `get`; `require`-style throwing is reserved for a deliberate error boundary. (The React side of the 2b fail-loud edge.)
- **Shape mirrors `db`** (collection-scoped `r.prompts.useGet`), retiring the flat `useEntity('prompts', id)` string-keying. The module-level singleton per store stays — that's the ergonomic part of today's hooks.

## Questions posed by this design

Take the target API as fixed and walk _backwards_ through the build steps it implies. Each
step is a perpendicular line; each poses questions — now with implementation in view.

### 1–2. Entity & collections — resolved

Settled (see Decisions → "Resolved — steps 1–2"): `New<E>` = `input`, writes return `void`,
`update` is a field-patch, `create` rejects / `set` upserts, reads fail loud all-or-nothing.
Open work begins at queries.

### 3. Queries — resolved

Declared as `{ on, sort?, desc? }` in the schema (table-scoped), generated as entity-returning
methods on the collection; declarative-only, comparator derived from the sort cell's type. See
Decisions → "Resolved — step 3".

### 4. Values — resolved

`Value<T>` = `{ get, set }`; `set` takes input, returns void; no `clear`. See Decisions →
"Resolved — step 4".

### 5. Batch — resolved

`batch(fn)` coalesces observer events; not atomic; nests (flat-merge); single-store. See
Decisions → "Resolved — step 5".

### 6. Container & assembly — intentions

`createDb(schema)` → `db` (clean API + `db.raw`). Recorded as intentions to confirm while
building. See Decisions → "Intentions — step 6".

## Appendix — grounding snippets from core (today)

```ts
// modules each discard 4/6 instance fields
this.boundStore = libraryStore.boundStore

// the index → entity rehydration dance (transcripts/session.ts export())
runs: this.boundIndexes.getSliceRowIds('runsBySessionNewestFirst', this.id)
        .map((id) => this.boundStore.tables.runs.requireEntity(id)),

// transaction as a bolt-on, .tables. noise inside (transcripts/session.ts appendMessage())
this.boundStore.transaction(() => {
  this.boundStore.tables.messages.setRow(messageId, {...})
  this.boundStore.tables.sessions.updateRow(this.id, { title, updatedAt: now })
})
```
