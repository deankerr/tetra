import type {
  BoundIndexes,
  IndexIds,
  StoreApiFor,
  StoreSchemasFor,
  TableDefinitions,
  TypedStoreSchema,
  ValueDefinitions,
} from '@tetra/tinybase-schema'
import { bindIndexes, bindStore } from '@tetra/tinybase-schema'
import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Indexes as RawIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import type { Store as RawStore } from 'tinybase/store/with-schemas'

// oxlint-disable no-unsafe-type-assertion -- Store hosts are the narrow boundary between dynamic TinyBase objects and zod-derived store definitions.

type AnyStoreSchema = TypedStoreSchema<TableDefinitions, ValueDefinitions>
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
export type RawStoreFor<Schema extends AnyStoreSchema> = RawStore<StoreSchemasFor<Schema>>
export type RawIndexesFor<Schema extends AnyStoreSchema> = RawIndexes<StoreSchemasFor<Schema>>

export interface StoreInstanceFor<Definition extends AnyStoreDefinition> {
  definition: Definition
  id: Definition['id']
  rawIndexes: RawIndexesFor<Definition['schema']>
  rawStore: RawStoreFor<Definition['schema']>
  typedIndexes: BoundIndexes<Definition['indexIds']>
  typedStore: StoreApiFor<Definition['schema']>
}

export type StoreHost<Definitions extends readonly AnyStoreDefinition[]> = {
  [Definition in Definitions[number] as Definition['id']]: StoreInstanceFor<Definition>
}

export function defineTetraStore<
  const Id extends string,
  const Schema extends AnyStoreSchema,
  const IndexIdList extends IndexIds = readonly [],
>(definition: StoreDefinition<Id, Schema, IndexIdList>): StoreDefinition<Id, Schema, IndexIdList> {
  return definition
}

export function createStoreInstance<const Definition extends AnyStoreDefinition>(
  definition: Definition,
  options: { mergeable?: boolean } = {},
): StoreInstanceFor<Definition> {
  type Schema = Definition['schema']
  const { schema } = definition

  // Store definitions own schema and indexes; callers choose the TinyBase runtime mode.
  const rawStore = (options.mergeable === true ? createMergeableStore() : createStore()).setSchema(
    structuredClone(schema.tablesSchema),
    structuredClone(schema.valuesSchema),
  ) as unknown as RawStoreFor<Schema>

  // Index handles are present for every store so app code can treat stores uniformly.
  const rawIndexes = createIndexes(rawStore) as RawIndexesFor<Schema>
  if (typeof definition.applyIndexes === 'function') {
    const applyIndexes = definition.applyIndexes as IndexApplier<Schema>
    applyIndexes(rawIndexes)
  }

  return {
    definition,
    id: definition.id,
    rawIndexes,
    rawStore,
    typedIndexes: bindIndexes(rawIndexes, definition.indexIds),
    typedStore: bindStore(rawStore, schema.tables, schema.values),
  } as unknown as StoreInstanceFor<Definition>
}

export function createStoreHost<const Definitions extends readonly AnyStoreDefinition[]>(
  definitions: Definitions,
): StoreHost<Definitions> {
  // App hosts are just named collections of volatile TinyBase stores.
  const entries = definitions.map((definition) => [definition.id, createStoreInstance(definition)])

  return Object.fromEntries(entries) as unknown as StoreHost<Definitions>
}
