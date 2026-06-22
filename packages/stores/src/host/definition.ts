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

export type StorePolicy = 'local-persisted' | 'synced' | 'tab-local'

export interface StoreDefinition<
  Id extends string,
  Schema extends AnyStoreSchema,
  IndexIdList extends IndexIds,
> {
  applyIndexes?: IndexApplier<Schema>
  id: Id
  indexIds: IndexIdList
  policy: StorePolicy
  schema: Schema
}

export type DefinedStore<
  Id extends string,
  Schema extends AnyStoreSchema,
  IndexIdList extends IndexIds,
> = StoreDefinition<Id, Schema, IndexIdList> & {
  indexesId: `${Id}Indexes`
  persisterId: `${Id}Persister`
  storeId: Id
  synchronizerId: `${Id}Synchronizer`
}

export interface AnyStoreDefinition {
  applyIndexes?: unknown
  id: string
  indexesId: string
  indexIds: IndexIds
  persisterId: string
  policy: StorePolicy
  schema: unknown
  storeId: string
  synchronizerId: string
}

export type RawStoreFor<Schema extends AnyStoreSchema> = RawStore<StoreSchemasFor<Schema>>
export type RawIndexesFor<Schema extends AnyStoreSchema> = RawIndexes<StoreSchemasFor<Schema>>
type SchemaFor<Definition extends AnyStoreDefinition> =
  Definition extends DefinedStore<string, infer Schema, IndexIds> ? Schema : never

export type StoreInstanceFor<Definition extends AnyStoreDefinition> =
  Definition extends DefinedStore<string, infer Schema, infer IndexIdList>
    ? {
        definition: Definition
        id: Definition['id']
        isMergeable: boolean
        rawIndexes: RawIndexesFor<Schema>
        rawStore: RawStoreFor<Schema>
        typedIndexes: BoundIndexes<IndexIdList>
        typedStore: StoreApiFor<Schema>
      }
    : never

export type StoreHost<Definitions extends readonly AnyStoreDefinition[]> = {
  [Definition in Definitions[number] as Definition['id']]: StoreInstanceFor<Definition>
}

export function defineTetraStore<
  const Id extends string,
  const Schema extends AnyStoreSchema,
  const IndexIdList extends IndexIds = readonly [],
>(definition: StoreDefinition<Id, Schema, IndexIdList>): DefinedStore<Id, Schema, IndexIdList> {
  return {
    ...definition,
    indexesId: `${definition.id}Indexes`,
    persisterId: `${definition.id}Persister`,
    storeId: definition.id,
    synchronizerId: `${definition.id}Synchronizer`,
  } as DefinedStore<Id, Schema, IndexIdList>
}

export function createStoreInstance<const Definition extends AnyStoreDefinition>(
  definition: Definition,
  options: { mergeable?: boolean } = {},
): StoreInstanceFor<Definition> {
  type Schema = SchemaFor<Definition>
  const schema = definition.schema as Schema

  // Store definitions own schema and indexes; hosts choose plain Store versus MergeableStore.
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
    isMergeable: options.mergeable === true,
    rawIndexes,
    rawStore,
    typedIndexes: bindIndexes(rawIndexes, definition.indexIds),
    typedStore: bindStore(rawStore, schema.tables, schema.values),
  } as unknown as StoreInstanceFor<Definition>
}

export function createStoreHost<const Definitions extends readonly AnyStoreDefinition[]>(
  definitions: Definitions,
  options: { mergeableStoreIds?: readonly Definitions[number]['id'][] } = {},
): StoreHost<Definitions> {
  // Hosts can vary store runtime mode without changing the store definitions themselves.
  const mergeableStoreIds = new Set(options.mergeableStoreIds)
  const entries = definitions.map((definition) => [
    definition.id,
    createStoreInstance(definition, { mergeable: mergeableStoreIds.has(definition.id) }),
  ])

  return Object.fromEntries(entries) as unknown as StoreHost<Definitions>
}

export function createTinyBaseProviderProps(
  host: Record<
    string,
    {
      definition: Pick<AnyStoreDefinition, 'indexesId' | 'storeId'>
      rawIndexes: unknown
      rawStore: unknown
    }
  >,
) {
  // TinyBase already supports named stores and indexes, so the host can provide everything by id.
  return {
    indexesById: Object.fromEntries(
      Object.values(host).map((instance) => [instance.definition.indexesId, instance.rawIndexes]),
    ),
    storesById: Object.fromEntries(
      Object.values(host).map((instance) => [instance.definition.storeId, instance.rawStore]),
    ),
  }
}
