# @tetra/tinybase-schema

Typed TinyBase helpers for defining TinyBase schemas from zod schemas.

This package is experimental. Its job is to stay close to TinyBase's API while
moving runtime parsing, row/entity typing, and repeated casts to one boundary.

## Goals

- Define table, value, and index metadata once.
- Generate TinyBase `tablesSchema` and `valuesSchema`.
- Derive row, entity, cell, and value types from zod schemas.
- Parse TinyBase reads through zod at the boundary.
- Keep the public API shaped like TinyBase where possible.

## Current Shape

Definitions use `defineTypedTinybase`:

```ts
export const dbDefinition = defineTypedTinybase({
  indexes: {
    messagesBySession: tinybaseIndex('messages', 'sessionId'),
  },
  tables: {
    messages: tinybaseTable({
      parts: tinybaseCell.array(MessageParts, { default: [] }),
      sessionId: tinybaseCell.string(z.string()),
    }),
  },
  values: {
    activeSessionId: tinybaseCell.string(z.string(), { default: '' }),
  },
})
```

The definition can create and bind TinyBase objects:

```ts
const store = dbDefinition.createTinybaseStore()
const db = dbDefinition.bindTinybaseStore(store)

const rawIndexes = dbDefinition.createTinybaseIndexes(store)
const indexes = dbDefinition.bindTinybaseIndexes(rawIndexes)
```

Bound table APIs currently include:

- `getRow`, `setRow`, `updateRow`, `deleteRow`
- `getEntity`, `requireEntity`, `listEntities`
- `getRowIds`, `hasRow`
- `getCell`, `setCell`

Bound store APIs currently include:

- `tables`, with named table APIs such as `db.tables.messages`
- `values`, with named value APIs such as `db.values.activeSessionId`
- `transaction`
- `store`, for integration boundaries

Bound value APIs currently include:

- `get`
- `set`
- `delete`

Bound index APIs currently include:

- `getSliceIds`
- `getSliceRowIds`
- per-index accessors such as `indexes.messagesBySession.getSliceRowIds(sliceId)`
- `raw`, for passing the underlying TinyBase `Indexes` object to TinyBase APIs

React hooks currently include:

- `useRow`
- `useEntity`
- `useEntityList`
- `useHasRow`
- `useCell`
- `useCellState`
- `useValue`
- `useSliceRowIds`

## Intentional Deviations From TinyBase

These are deliberate project-shaped choices, not accidental API drift:

- `updateRow` throws `Missing row: table/id` when the row does not exist.
  Raw TinyBase partial row updates can create or fill rows; this package treats
  updates as updates.
- Reads are parsed through zod and can throw if persisted data does not match
  the schema. This is preferred for Tetra's prototype mode.
- `getEntity` / `requireEntity` add the row id to parsed rows.
- Index ids are typed from the definition object. Slice ids are still plain
  strings.

## Escape Hatches

Some TinyBase integrations still need raw objects:

- Persistence receives the raw `store`.
- React `Provider` receives the raw `store` and `indexes`.
- `indexes.raw` exposes the raw TinyBase `Indexes` object for that purpose.

This is the preferred escape hatch style: expose the raw TinyBase object only at
integration boundaries that require it.

## Boundary Casts

Some external shapes are intentionally trusted after a small runtime check:

- `UIMessage['parts']` is stored as an array cell and checked with
  `Array.isArray`.
- AI SDK / provider JSON-like objects can be validated as JSON-compatible and
  then typed as the external library's JSON shape.

The aim is one cast at the schema boundary, not repeated casts throughout app
code.

## Deferred

Hold off on these until the app needs them:

- Typing index `sliceId` from the indexed cell output.
- Wrapping `useStore` / `addCellListener`.
- Entity-returning index helpers such as `getSliceEntities`.
- Opinionated batch helpers such as `replaceRows`, `deleteRowsWhere`, or
  insert-only APIs.
- Domain-specific error message mapping for every missing row.

## Current Design Notes

- `db.tables` in Tetra contains table APIs only. Store-level values live under
  `db.values`, and `transaction` lives at the DB boundary.
- `raw` escape hatches should stay rare and explicit.
- Prefer adding wrappers only when Tetra already has a raw TinyBase call site
  that would benefit from typing.
