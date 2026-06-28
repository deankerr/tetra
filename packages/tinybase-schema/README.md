# @tetra/tinybase-schema

Define a TinyBase store from zod schemas, and read and write it through typed,
zod-parsed accessors.

TinyBase stores cells as coarse, loosely-typed values. This package lets you
declare a store's shape once as zod schemas, generates the matching TinyBase
`tablesSchema`/`valuesSchema`, and gives back accessors whose rows, cells, and
values are typed from — and parsed through — those same schemas. Parsing happens
at the read/write boundary, so the rest of the app works with precise types and
fails loudly when persisted data drifts from the schema.

It does not own persistence, sync, or lifecycle. Those operate on the raw
TinyBase `Store`/`Indexes`, which every instance exposes (see
[Escape hatches](#escape-hatches)).

## Concepts

The pipeline has three stages, each building on the last:

| Stage          | You call                | You get                                                    |
| -------------- | ----------------------- | ---------------------------------------------------------- |
| **Schema**     | `defineStoreSchema`     | a `StoreSchema`: zod definitions + TinyBase schemas        |
| **Definition** | `defineStoreDefinition` | a schema plus an id and index wiring                       |
| **Instance**   | `createStoreInstance`   | live `rawStore`/`rawIndexes` + `boundStore`/`boundIndexes` |

- **raw** objects are TinyBase's own `Store`/`Indexes`. Hand these to persisters,
  synchronizers, and the React `Provider`.
- **bound** objects are this package's typed wrappers over the raw objects.
  Read and write through these; cells and rows are typed and zod-parsed.
- An **entity** is a parsed row plus its `id`.

## Usage

### Define a store

```ts
import { defineStoreSchema } from '@tetra/tinybase-schema'
import { defineStoreDefinition } from '@tetra/tinybase-schema/runtime'
import { z } from 'zod'

const messagesSchema = defineStoreSchema({
  tables: {
    messages: z.object({
      createdAt: z.number(),
      parts: MessagePart.array(),
      sessionId: z.string(),
    }),
  },
  values: {
    activeSessionId: z.string().nullable().default(null),
  },
})

const messagesDefinition = defineStoreDefinition({
  applyIndexes(indexes) {
    indexes.setIndexDefinition('messagesBySession', 'messages', 'sessionId', 'createdAt')
  },
  id: 'messages',
  indexIds: ['messagesBySession'] as const,
  schema: messagesSchema,
})
```

Index definitions use TinyBase's native `setIndexDefinition` builder inside
`applyIndexes`. The `indexIds` tuple is what types the slice accessors later.

### Create an instance and read/write

```ts
import { createStoreInstance } from '@tetra/tinybase-schema/runtime'

const messages = createStoreInstance(messagesDefinition)

// Bound, typed access — rows and cells are parsed through zod.
messages.boundStore.tables.messages.setRow('msg_1', {
  createdAt: Date.now(),
  parts: [{ text: 'hi', type: 'text' }],
  sessionId: 'sess_1',
})
const entity = messages.boundStore.tables.messages.requireEntity('msg_1') // row + { id }
const ids = messages.boundIndexes.getSliceRowIds('messagesBySession', 'sess_1')

// Mergeable variant for sync; same shape, same bound API.
import { createMergeableStoreInstance } from '@tetra/tinybase-schema/runtime'
const syncMessages = createMergeableStoreInstance(messagesDefinition)
```

Group writes in a transaction through the bound store; it forwards to the raw
store's transaction:

```ts
messages.boundStore.transaction(() => {
  messages.boundStore.tables.messages.deleteRow('msg_1')
  messages.boundStore.values.activeSessionId.set('sess_2')
})
```

### React

```tsx
import {
  StoreProvider,
  createStoreReactApi,
  createTinyBaseProviderProps,
} from '@tetra/tinybase-schema/react'

export const messagesTinybase = createStoreReactApi(messagesDefinition)

function Root({ children }) {
  return <StoreProvider {...createTinyBaseProviderProps({ messages })}>{children}</StoreProvider>
}

function MessageList({ sessionId }) {
  const ids = messagesTinybase.useSliceRowIds('messagesBySession', sessionId)
  // ...
}
```

`createTinyBaseProviderProps` derives the `storesById`/`indexesById` the TinyBase
`Provider` expects from one or more instances, naming each store's indexes
`<id>Indexes`.

## API

### `@tetra/tinybase-schema`

- `defineStoreSchema({ tables, values? })` → `StoreSchema`. `tables` maps table
  ids to `z.object` row schemas; `values` maps value ids to zod schemas.
- Types: `BoundStoreFor<Schema>`, `StoreRowsFor<Schema>` (table-id keyed entity
  rows, e.g. `Rows['messages']`), `TinybaseSchemasFor<Schema>` (the
  `[tablesSchema, valuesSchema]` tuple TinyBase wants), `BoundIndexes<IndexIds>`.

### `@tetra/tinybase-schema/runtime`

- `defineStoreDefinition(definition)` — identity helper that infers the
  definition types.
- `createStoreInstance(definition)` / `createMergeableStoreInstance(definition)`
  → an instance exposing `rawStore`, `rawIndexes`, `boundStore`, `boundIndexes`,
  plus `id` and `definition`.
- Types: `StoreDefinition`, `AnyStoreDefinition`, `StoreInstanceFor`,
  `MergeableStoreInstanceFor`, `RawIndexesFor`.

#### Bound table API — `boundStore.tables.<id>`

`getRow` · `setRow` · `updateRow` · `deleteRow` · `getEntity` · `getEntities` ·
`requireEntity` · `listEntities` · `getRowIds` · `hasRow` · `getCell` · `setCell`.
Also addressable as `boundStore.tables.get(id)`.

#### Bound value API — `boundStore.values.<id>`

`get` · `set` · `delete`. Also `boundStore.values.get(id)`.

#### Bound index API — `boundIndexes`

`getSliceIds(indexId)` · `getSliceRowIds(indexId, sliceId)`, plus per-index
accessors `boundIndexes.<indexId>.getSliceRowIds(sliceId)`.

### `@tetra/tinybase-schema/react`

`createStoreReactApi(definition)` → a `StoreReactApi` of hooks: `useRow`,
`useRowIds`, `useEntity`, `useEntityList`, `useHasRow`, `useCell`, `useCellState`,
`useValue`, `useValueState`, `useSliceIds`, `useSliceEntities`, `useSliceRowIds`.
Plus `StoreProvider` and `createTinyBaseProviderProps`.

## Behavior

- **Reads parse and can throw.** Bound reads and hooks run persisted data through
  zod. If stored data no longer matches the schema, the read throws rather than
  returning a malformed value — intentional for Tetra's prototype mode.
- **Writes parse first.** Bound mutations parse their input through zod before
  calling TinyBase, so an invalid non-`undefined` input throws before TinyBase
  can silently repair it with a default.
- **`requireEntity` / `updateRow` throw on a missing row.** Updates are treated as
  updates, not upserts (`Missing row: table/id`). `getEntity` returns `null`
  instead.
- **Entities carry `id`.** `getEntity`, `requireEntity`, and the list/slice entity
  reads add the row id to the parsed row.
- **No optional cells.** TinyBase can't reliably clear a cell through normal
  writes, so an optional cell schema throws at schema creation — use
  `.nullable()` and explicit `null` for absence.
- **Defaults.** A zod default is a parser fallback (applied on `undefined` input);
  it is also emitted as the TinyBase native default. Tetra generally avoids
  schema defaults so missing data fails loudly unless a default is a deliberate
  part of the stored state.

## Escape hatches

Persistence, sync, lifecycle, and the React `Provider` work on raw TinyBase
objects, which the composition root owns:

- Persisters and synchronizers take `instance.rawStore`.
- The React `Provider` takes the raw store and indexes (via
  `createTinyBaseProviderProps`).

This package may create the runtime instance, but it does not choose storage
policy — which stores are grouped, persisted, or synced stays outside it.

## Design notes

- Store and index binding are separate because TinyBase keeps `Store` and
  `Indexes` as separate objects. Index definitions are built at the composition
  root via TinyBase's native `setIndexDefinition`.
- The binders accept a structural `Store`/`Indexes` shape rather than TinyBase's
  raw or `with-schemas` interfaces — they only need the runtime methods they call.
  TinyBase's schema-aware types are still used at instance creation and the React
  boundary.
- Some external shapes are trusted after a minimal boundary check, stored as
  array/record cells (`UIMessage['parts']`, provider JSON) — one cast at the
  schema boundary rather than repeated casts in app code.
- Add wrappers when a real call site needs them, not speculatively.

### Deferred

- Typing index `sliceId` from the indexed cell output.
- Wrapping wider state hooks (`useRowState`, `useTableState`, `useValuesState`).
- Opinionated batch helpers (`replaceRows`, `deleteRowsWhere`, insert-only APIs).
