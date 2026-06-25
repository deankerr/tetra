# @tetra/tinybase-schema

Typed TinyBase helpers for defining TinyBase schemas from zod schemas.

This package is experimental. Its job is to stay close to TinyBase's API while
moving runtime parsing, row/entity typing, and repeated casts to one boundary.

## Goals

- Define table and value metadata once.
- Generate TinyBase `tablesSchema` and `valuesSchema` from zod schemas.
- Derive row, entity, cell, and value types from zod schemas.
- Parse TinyBase reads through zod at the boundary.
- Optionally create typed TinyBase runtime instances from typed definitions.
- Keep the public API shaped like TinyBase where possible.

## Current Shape

Store schemas use `defineTypedStore`:

```ts
export const storeSchema = defineTypedStore({
  tables: {
    messages: z.object({
      parts: z.array(MessagePart).default([]),
      sessionId: z.string(),
    }),
  },
  values: {
    activeSessionId: z.string().default(''),
  },
})
```

The store schema emits TinyBase schemas by reading zod's Standard JSON Schema
output and keeping only the small shape TinyBase can express: `string`,
`number`, `boolean`, `array`, `object`, `default`, and nullable `allowNull`.
Unsupported cell schemas throw during schema creation rather than silently
becoming loose storage. Store and Indexes binding are separate so callers can
keep ownership of TinyBase runtime objects:

```ts
const store = createStore().setSchema(storeSchema.tablesSchema, storeSchema.valuesSchema)
const db = bindStore(store, storeSchema.tables, storeSchema.values)

const rawIndexes = createIndexes(store)
rawIndexes.setIndexDefinition('messagesBySession', 'messages', 'sessionId')
const indexes = bindIndexes(rawIndexes, ['messagesBySession'] as const)
```

Composition roots that want the standard runtime shape can define a store and
create an instance:

```ts
const messagesDefinition = defineStoreDefinition({
  applyIndexes(indexes) {
    indexes.setIndexDefinition('messagesBySession', 'messages', 'sessionId')
  },
  id: 'messages',
  indexIds: ['messagesBySession'] as const,
  schema: storeSchema,
})

const messages = createStoreInstance(messagesDefinition)
const syncMessages = createMergeableStoreInstance(messagesDefinition)
```

The resulting instance exposes the raw TinyBase `store` / `indexes` alongside
the bound typed `typedStore` / `typedIndexes`.

Use TinyBase's own schema-aware types for raw runtime objects, parameterized by
`StoreSchemasFor<typeof storeSchema>`. The helper surfaces are:

- `StoreApiFor<typeof storeSchema>` for the bound `{ tables, values }`
  helper API.
- `BoundIndexes<typeof indexIds>` for the bound index helper API.
- `StoreInstanceFor<typeof storeDefinition>` for a raw-plus-typed runtime
  instance.
- `StoreRowsFor<typeof storeSchema>` for table-id keyed entity row types, such
  as `Rows['messages']`.

Source files mirror the TinyBase concepts they wrap:

- `table.ts` and `schema.ts` define zod-backed schemas and emit
  TinyBase-compatible schema objects.
- `store.ts` binds table/value helpers around a caller-owned `Store`.
- `indexes.ts` binds a caller-owned, already-configured `Indexes` object.
- `runtime.ts` creates typed Store/Indexes instances from typed definitions.
- `store-schema.ts` composes the store schema object and stateless parsers.

The bind functions intentionally accept a structural Store/Indexes API rather
than TinyBase's raw or `with-schemas` interfaces. TinyBase's schema-aware types
are useful at creation and React boundaries, but the binders only need the
runtime methods they call.

Bound table APIs currently include:

- `getRow`, `setRow`, `updateRow`, `deleteRow`
- `getEntity`, `getEntities`, `requireEntity`, `listEntities`
- `getRowIds`, `hasRow`
- `getCell`, `setCell`

Bound store APIs currently include:

- `tables`, with named table APIs such as `db.tables.messages`
- `values`, with named value APIs such as `db.values.activeSessionId`

Bound value APIs currently include:

- `get`
- `set`
- `delete`

Bound index APIs currently include:

- `getSliceIds`
- `getSliceRowIds`
- per-index accessors such as `indexes.messagesBySession.getSliceRowIds(sliceId)`

React hooks currently include:

- `useRow`
- `useRowIds`
- `useEntity`
- `useEntityList`
- `useHasRow`
- `useCell`
- `useCellState`
- `useValue`
- `useValueState`
- `useSliceIds`
- `useSliceEntities`
- `useSliceRowIds`

## Typed Surface Parity

The regular and React typed surfaces should stay in parity for table, value,
and index read coverage. When a typed read helper is useful outside React, add
the equivalent hook when React can subscribe to the same TinyBase data. When a
hook composes multiple TinyBase sources, keep the regular API as explicit
building blocks unless this package also owns the runtime relationship.

For example, the regular API exposes `table.getEntities(rowIds)` and typed
indexes expose `getSliceRowIds(indexId, sliceId)`. The React API can then offer
`useSliceEntities(indexId, sliceId, tableId)` because the hook can subscribe to
both the index slice and the table. Mutations and lifecycle wiring do not need
forced parity; they should follow TinyBase ownership boundaries and real app
usage.

## Default Semantics

Zod defaults and TinyBase defaults are related but not identical:

- A zod default is a parser fallback. It applies when zod receives `undefined`
  input, and the parsed output is then written to TinyBase by the bound APIs.
- A TinyBase default is a store fallback. For values, a defaulted value is
  present immediately after the schema is applied. For row cells, defaulted
  cells are filled when a row exists; a missing row remains missing.
- Raw TinyBase writes do not throw when a cell or value has the wrong type. If
  the schema has a default, TinyBase writes the default instead. If the schema
  has no default, TinyBase omits the invalid cell or value and reports it
  through invalid-cell or invalid-value listeners.
- The bound typed APIs parse mutation inputs with zod before calling TinyBase.
  Invalid non-`undefined` inputs therefore throw before TinyBase can repair
  them with a default. Missing or `undefined` inputs may still become zod
  defaults if the schema says so.

## Intentional Deviations From TinyBase

These are deliberate project-shaped choices, not accidental API drift:

- `updateRow` throws `Missing row: table/id` when the row does not exist.
  Raw TinyBase partial row updates can create or fill rows; this package treats
  updates as updates.
- Reads are parsed through zod and can throw if persisted data does not match
  the schema. This is preferred for Tetra's prototype mode.
- `getEntity` / `requireEntity` add the row id to parsed rows.
- Index ids are typed from the caller-provided index id tuple. Slice ids are
  still plain strings.
- TinyBase native `default` values are derived from zod defaults. Tetra core
  still generally avoids schema defaults in its real schema so missing values
  fail loudly unless the read site has an explicit fallback or the default is
  deliberately part of the stored state model.

## Escape Hatches

Some TinyBase integrations still need raw objects:

- Persistence receives the raw `store`.
- React `Provider` receives the raw `store` and `indexes`.

Those objects should be owned by the composition root. This package may create
the generic typed runtime instance, but it should not choose app storage policy:
persistence, sync, lifecycle, and which stores are grouped together remain
outside `@tetra/tinybase-schema`.

## Boundary Casts

Some external shapes are intentionally trusted after a small runtime check:

- `UIMessage['parts']` is stored as an array cell by declaring it as
  `z.array(MessagePart)`, where each part is checked just enough for the app's
  storage boundary.
- AI SDK / provider JSON-like objects are stored as `z.record(z.string(),
z.json())`.

The aim is one cast at the schema boundary, not repeated casts throughout app
code.

## Deferred

Hold off on these until the app needs them:

- Typing index `sliceId` from the indexed cell output.
- Wrapping `useStore` / `addCellListener`.
- Wrapping wider state hooks such as `useRowState`, `useTableState`, and
  `useValuesState`.
- Opinionated batch helpers such as `replaceRows`, `deleteRowsWhere`, or
  insert-only APIs.
- Domain-specific error message mapping for every missing row.

## Current Design Notes

- `db.tables` in Tetra contains table APIs only. Store-level values live under
  `db.values`, and transactions should use the caller-owned TinyBase Store
  directly.
- Store binding and index binding are separate functions because TinyBase keeps
  `Store` and `Indexes` as separate objects. Index definitions use TinyBase's
  native `setIndexDefinition` builder API at the composition root.
- `StoreApiFor<typeof storeSchema>` and `BoundIndexes<typeof indexIds>`
  are helper types, not TinyBase raw object types. `RawStoreFor` and
  `RawIndexesFor` describe raw TinyBase objects parameterized by a typed schema
  when integration code needs them.
- `raw` escape hatches should stay rare and explicit.
- Prefer adding wrappers only when Tetra already has a raw TinyBase call site
  that would benefit from typing.
- TinyBase persisters, synchronizers, and app lifecycle remain runtime concerns
  owned outside this package.
