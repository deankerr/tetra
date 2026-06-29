import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Indexes as RawIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import type { MergeableStore as RawMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import type { Store as RawStore } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

import { makeCollection } from './collection.ts'
import type { Collection } from './collection.ts'
import type { TinybaseStoreSchemasOf } from './emit.ts'
import { buildQueries } from './query.ts'
import type { QueriesForTable } from './query.ts'
import type { AnyStoreSchema, StoreSchema } from './schema.ts'
import type {
  EntityOf,
  IndexDecl,
  IndexDefinitions,
  IndexesApi,
  NewOf,
  RowZod,
  StoreApi,
  TableDefinitions,
  ValueDefinitions,
} from './types.ts'
import { makeValue } from './value.ts'
import type { Value } from './value.ts'

// The clean handle plus a raw escape hatch. Only the raw store type varies between the
// plain and mergeable variants, so the shape is shared and parameterised by StoreKind.
type DbShape<
  Tables extends TableDefinitions,
  Values extends ValueDefinitions,
  Indexes extends IndexDefinitions<Tables>,
  StoreKind,
> = {
  [TableId in keyof Tables]: Collection<EntityOf<Tables[TableId]>, NewOf<Tables[TableId]>> &
    QueriesForTable<Tables[TableId], Indexes[TableId]>
} & {
  batch(fn: () => void): void
  raw: { indexes: RawIndexes<TinybaseStoreSchemasOf<Tables, Values>>; store: StoreKind }
  values: {
    [ValueId in keyof Values]: Value<z.output<Values[ValueId]>, z.input<Values[ValueId]>>
  }
}

export type DbFor<Schema extends AnyStoreSchema> =
  Schema extends StoreSchema<infer Tables, infer Values, infer Indexes>
    ? DbShape<Tables, Values, Indexes, RawStore<TinybaseStoreSchemasOf<Tables, Values>>>
    : never

export type MergeableDbFor<Schema extends AnyStoreSchema> =
  Schema extends StoreSchema<infer Tables, infer Values, infer Indexes>
    ? DbShape<Tables, Values, Indexes, RawMergeableStore<TinybaseStoreSchemasOf<Tables, Values>>>
    : never

export type EntitiesFor<Schema extends AnyStoreSchema> =
  Schema extends StoreSchema<infer Tables, ValueDefinitions, infer _Indexes>
    ? { [TableId in keyof Tables]: EntityOf<Tables[TableId]> }
    : never

// The emitted TinyBase `[tablesSchema, valuesSchema]` tuple. Needed where TinyBase's own
// with-schemas generics must be named directly (e.g. the worker's Durable Object).
export type SchemasOf<Schema extends AnyStoreSchema> =
  Schema extends StoreSchema<infer Tables, infer Values, IndexDefinitions<TableDefinitions>>
    ? TinybaseStoreSchemasOf<Tables, Values>
    : never

// oxlint-disable no-unsafe-argument, no-unsafe-type-assertion -- createDb is the boundary between TinyBase's dynamic objects and the zod-derived handle.

export function createDb<const Schema extends AnyStoreSchema>(schema: Schema): DbFor<Schema> {
  return assembleDb(schema, createStore()) as DbFor<Schema>
}

export function createMergeableDb<const Schema extends AnyStoreSchema>(
  schema: Schema,
): MergeableDbFor<Schema> {
  return assembleDb(schema, createMergeableStore()) as MergeableDbFor<Schema>
}

// Shared assembly over an already-constructed (plain or mergeable) base store.
function assembleDb(schema: AnyStoreSchema, baseStore: { setSchema: unknown }): unknown {
  const rawStore = (baseStore as RawStoreLike).setSchema(
    structuredClone(schema.tablesSchema),
    structuredClone(schema.valuesSchema),
  )
  const rawIndexes = createIndexes(rawStore)

  const store = rawStore as unknown as StoreApi
  const indexes = rawIndexes as unknown as IndexesApi

  applyIndexes(schema, rawIndexes as unknown as RawIndexApi)

  // Assemble: each collection gains its inferred query methods; values + batch + raw round it out.
  const db: Record<string, unknown> = {
    batch(fn: () => void) {
      store.transaction(fn)
    },
    raw: { indexes: rawIndexes, store: rawStore },
    values: Object.fromEntries(
      Object.entries(schema.values).map(([valueId, valueSchema]) => [
        valueId,
        makeValue(store, valueId, valueSchema),
      ]),
    ),
  }

  for (const [tableId, table] of Object.entries(schema.tables)) {
    const collection = makeCollection(store, tableId, table)
    const tableIndexes = schema.indexes[tableId] ?? {}
    db[tableId] = Object.assign(
      collection,
      buildQueries(store, indexes, tableId, tableIndexes, table),
    )
  }

  return db
}

// Minimal views of the TinyBase store/indexes used during assembly.
interface RawStoreLike {
  setSchema(tablesSchema: unknown, valuesSchema: unknown): Parameters<typeof createIndexes>[0]
}

interface RawIndexApi {
  setIndexDefinition(
    indexId: string,
    tableId: string,
    getSliceIdOrIds: string,
    getSortKey: string,
    sliceIdSorter: undefined,
    rowIdSorter: ((a: string, b: string) => number) | undefined,
  ): unknown
}

function applyIndexes(schema: AnyStoreSchema, indexes: RawIndexApi): void {
  for (const [tableId, tableIndexes] of Object.entries(schema.indexes)) {
    for (const [name, decl] of Object.entries(tableIndexes ?? {})) {
      const sortCell = decl.sort ?? decl.on
      // Index id namespaced by table — TinyBase index ids are global; method names are not.
      indexes.setIndexDefinition(
        `${tableId}/${name}`,
        tableId,
        decl.on,
        sortCell,
        undefined,
        rowIdSorter(schema, tableId, sortCell, decl),
      )
    }
  }
}

// Comparison is derived from the sort cell's emitted type: numeric cells sort
// numerically, others lexically. Ascending-lexical is left to TinyBase's default.
function rowIdSorter(
  schema: AnyStoreSchema,
  tableId: string,
  sortCell: string,
  decl: IndexDecl<RowZod>,
): ((a: string, b: string) => number) | undefined {
  const tableSchema = schema.tablesSchema[tableId] as Record<string, { type: string }>
  const numeric = tableSchema[sortCell]?.type === 'number'
  const desc = decl.desc === true

  if (numeric) {
    return desc ? (a, b) => Number(b) - Number(a) : (a, b) => Number(a) - Number(b)
  }

  // Descending lexical needs an explicit reversed comparator; ascending uses TinyBase's default.
  if (desc) {
    return (a, b) => b.localeCompare(a)
  }

  return undefined
}
