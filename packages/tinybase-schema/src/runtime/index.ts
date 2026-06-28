import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Indexes as RawIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import type { MergeableStore as RawMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import type { Store as RawStore } from 'tinybase/store/with-schemas'

import { bindIndexes } from '../binding/indexes.ts'
import type { BoundIndexes, IndexIds } from '../binding/indexes.ts'
import { bindStore } from '../binding/store.ts'
import type { BoundStoreFor, StoreSchema, TinybaseSchemasFor } from '../schema/define.ts'
import type { TableDefinitions, ValueDefinitions } from '../schema/types.ts'

// oxlint-disable no-unsafe-type-assertion -- Runtime creation is the boundary between TinyBase's dynamic objects and zod-derived definitions.

type AnyStoreSchema = StoreSchema<TableDefinitions, ValueDefinitions>
type IndexApplier<Schema extends AnyStoreSchema> = {
  apply(indexes: RawIndexesFor<Schema>): void
}['apply']

export interface StoreDefinition<
  Id extends string,
  Schema extends AnyStoreSchema,
  IndexIdList extends IndexIds,
> {
  applyIndexes?: IndexApplier<Schema>
  id: Id
  indexIds: IndexIdList
  schema: Schema
}

export interface AnyStoreDefinition {
  applyIndexes?: unknown
  id: string
  indexIds: IndexIds
  schema: AnyStoreSchema
}

export type RawIndexesFor<Schema extends AnyStoreSchema> = RawIndexes<TinybaseSchemasFor<Schema>>
type RawStoreFor<Schema extends AnyStoreSchema> = RawStore<TinybaseSchemasFor<Schema>>

type RawMergeableStoreFor<Schema extends AnyStoreSchema> = RawMergeableStore<
  TinybaseSchemasFor<Schema>
>

export interface StoreInstanceFor<
  Definition extends AnyStoreDefinition,
  Store = RawStoreFor<Definition['schema']>,
> {
  definition: Definition
  id: Definition['id']
  rawIndexes: RawIndexesFor<Definition['schema']>
  rawStore: Store
  boundIndexes: BoundIndexes<Definition['indexIds']>
  boundStore: BoundStoreFor<Definition['schema']>
}

export type MergeableStoreInstanceFor<Definition extends AnyStoreDefinition> = StoreInstanceFor<
  Definition,
  RawMergeableStoreFor<Definition['schema']>
>

export function defineStoreDefinition<
  const Id extends string,
  const Schema extends AnyStoreSchema,
  const IndexIdList extends IndexIds = readonly [],
>(definition: StoreDefinition<Id, Schema, IndexIdList>): StoreDefinition<Id, Schema, IndexIdList> {
  return definition
}

export function createStoreInstance<const Definition extends AnyStoreDefinition>(
  definition: Definition,
): StoreInstanceFor<Definition> {
  type Schema = Definition['schema']
  const { schema } = definition

  // TinyBase schemas are cloned so each runtime instance owns mutable schema objects.
  const rawStore = createStore().setSchema(
    structuredClone(schema.tablesSchema),
    structuredClone(schema.valuesSchema),
  ) as unknown as RawStoreFor<Schema>

  return bindStoreInstance(definition, rawStore)
}

export function createMergeableStoreInstance<const Definition extends AnyStoreDefinition>(
  definition: Definition,
): MergeableStoreInstanceFor<Definition> {
  type Schema = Definition['schema']
  const { schema } = definition

  // Mergeable stores use the same zod-derived TinyBase schema, with merge metadata added by TinyBase.
  const rawStore = createMergeableStore().setSchema(
    structuredClone(schema.tablesSchema),
    structuredClone(schema.valuesSchema),
  ) as unknown as RawMergeableStoreFor<Schema>
  const instance = bindStoreInstance(definition, rawStore as unknown as RawStoreFor<Schema>)

  return { ...instance, rawStore } as unknown as MergeableStoreInstanceFor<Definition>
}

function bindStoreInstance<const Definition extends AnyStoreDefinition, Store>(
  definition: Definition,
  rawStore: Store,
): StoreInstanceFor<Definition, Store> {
  type Schema = Definition['schema']
  const { schema } = definition

  // Index handles are present for every instance so app code can treat stores uniformly.
  const rawStoreForIndexes = rawStore as RawStoreFor<Schema>
  const rawIndexes = createIndexes(rawStoreForIndexes) as RawIndexesFor<Schema>
  if (typeof definition.applyIndexes === 'function') {
    const applyIndexes = definition.applyIndexes as IndexApplier<Schema>
    applyIndexes(rawIndexes)
  }

  return {
    boundIndexes: bindIndexes(rawIndexes, definition.indexIds),
    boundStore: bindStore(rawStoreForIndexes, schema.tables, schema.values),
    definition,
    id: definition.id,
    rawIndexes,
    rawStore,
  } as unknown as StoreInstanceFor<Definition, Store>
}
