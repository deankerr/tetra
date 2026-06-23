import type {
  CellOutputOf,
  EntityOf,
  IndexIds,
  OutputRowOf,
  StoreSchemasFor,
  TableDefinitions,
  TableSchemaOf,
  TypedStoreSchema,
  ValueDefinitions,
} from '@tetra/tinybase-schema'
import { createStoreHooks } from '@tetra/tinybase-schema/react'
import type { DependencyList, ReactNode } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import type { z } from 'zod'

import type { AnyStoreDefinition, DefinedStore, RawIndexesFor, RawStoreFor } from './definition.ts'
import type { RuntimePersister, RuntimeStoreInstance, RuntimeSynchronizer } from './runtime.ts'

// oxlint-disable no-unsafe-return, no-unsafe-type-assertion -- This file adapts TinyBase's generic React hooks to store-bound Tetra hooks.

type DefinitionSchema<Definition extends AnyStoreDefinition> =
  Definition extends DefinedStore<string, infer Schema, IndexIds> ? Schema : never

type DefinitionIndexIds<Definition extends AnyStoreDefinition> = Definition['indexIds']

type TablesOf<Schema> =
  Schema extends TypedStoreSchema<infer Tables, ValueDefinitions> ? Tables : never

type ValuesOf<Schema> =
  Schema extends TypedStoreSchema<TableDefinitions, infer Values> ? Values : never

type CellInput<
  Tables extends TableDefinitions,
  TableId extends keyof Tables & string,
  CellId extends keyof z.input<TableSchemaOf<Tables[TableId]>> & string,
> = z.input<TableSchemaOf<Tables[TableId]>>[CellId]

type CellOutput<
  Tables extends TableDefinitions,
  TableId extends keyof Tables & string,
  CellId extends keyof z.output<TableSchemaOf<Tables[TableId]>> & string,
> = z.output<TableSchemaOf<Tables[TableId]>>[CellId]

type ValueInput<Values extends ValueDefinitions, ValueId extends keyof Values & string> = z.input<
  Values[ValueId]
>

type ValueOutput<Values extends ValueDefinitions, ValueId extends keyof Values & string> = z.output<
  Values[ValueId]
>

interface StoreHostProviderProps {
  children: ReactNode
  indexesById?: Record<string, unknown>
  persistersById?: Record<string, RuntimePersister | undefined>
  storesById?: Record<string, unknown>
  synchronizersById?: Record<string, RuntimeSynchronizer | undefined>
}

interface StoreHostReact {
  Provider(props: StoreHostProviderProps): ReactNode
  useCreatePersister(
    store: unknown,
    create: (
      store: unknown,
    ) => Promise<RuntimePersister | undefined> | RuntimePersister | undefined,
    createDeps?: DependencyList,
    then?: (persister: RuntimePersister) => Promise<unknown>,
    thenDeps?: DependencyList,
    destroy?: (persister: RuntimePersister) => void,
    destroyDeps?: DependencyList,
  ): RuntimePersister | undefined
  useCreateSynchronizer(
    store: unknown,
    create: (
      store: unknown,
    ) => Promise<RuntimeSynchronizer | undefined> | RuntimeSynchronizer | undefined,
    createDeps?: DependencyList,
    destroy?: (synchronizer: RuntimeSynchronizer) => void,
    destroyDeps?: DependencyList,
  ): RuntimeSynchronizer | undefined
}

const storeHostReact = UiReact as unknown as StoreHostReact

export interface StoreReactApi<
  Definition extends AnyStoreDefinition,
  Schema extends TypedStoreSchema<TableDefinitions, ValueDefinitions> =
    DefinitionSchema<Definition>,
  Tables extends TableDefinitions = TablesOf<Schema>,
  Values extends ValueDefinitions = ValuesOf<Schema>,
  IndexIdList extends IndexIds = DefinitionIndexIds<Definition>,
> {
  useCell<
    TableId extends keyof Tables & string,
    CellId extends keyof z.output<TableSchemaOf<Tables[TableId]>> & string,
  >(
    tableId: TableId,
    rowId: string,
    cellId: CellId,
  ): CellOutputOf<TableSchemaOf<Tables[TableId]>, CellId> | undefined
  useCellState<
    TableId extends keyof Tables & string,
    CellId extends keyof z.output<TableSchemaOf<Tables[TableId]>> &
      keyof z.input<TableSchemaOf<Tables[TableId]>> &
      string,
  >(
    tableId: TableId,
    rowId: string,
    cellId: CellId,
  ): [
    CellOutput<Tables, TableId, CellId> | undefined,
    (value: CellInput<Tables, TableId, CellId>) => void,
  ]
  useEntity<TableId extends keyof Tables & string>(
    tableId: TableId,
    rowId: string,
  ): EntityOf<TableSchemaOf<Tables[TableId]>> | null
  useEntityList<TableId extends keyof Tables & string>(
    tableId: TableId,
  ): EntityOf<TableSchemaOf<Tables[TableId]>>[]
  useHasRow(tableId: keyof Tables & string, rowId: string): boolean
  useRawIndexes(): RawIndexesFor<Schema> | undefined
  useRawPersister(): RuntimePersister | undefined
  useRawStore(): RawStoreFor<Schema> | undefined
  useRawSynchronizer(): RuntimeSynchronizer | undefined
  useRow<TableId extends keyof Tables & string>(
    tableId: TableId,
    rowId: string,
  ): OutputRowOf<TableSchemaOf<Tables[TableId]>> | null
  useRowIds(tableId: keyof Tables & string): string[]
  useSliceEntities<TableId extends keyof Tables & string>(
    indexId: IndexIdList[number],
    sliceId: string,
    tableId: TableId,
  ): EntityOf<TableSchemaOf<Tables[TableId]>>[]
  useSliceIds(indexId: IndexIdList[number]): string[]
  useSliceRowIds(indexId: IndexIdList[number], sliceId: string): string[]
  useValue<ValueId extends keyof Values & string>(valueId: ValueId): ValueOutput<Values, ValueId>
  useValueState<ValueId extends keyof Values & string>(
    valueId: ValueId,
  ): [ValueOutput<Values, ValueId>, (value: ValueInput<Values, ValueId>) => void]
}

export function StoreHostProvider(props: StoreHostProviderProps): ReactNode {
  return storeHostReact.Provider(props)
}

export function useCreateRuntimePersister(
  instance: RuntimeStoreInstance,
  create: (
    instance: RuntimeStoreInstance,
  ) => Promise<RuntimePersister | undefined> | RuntimePersister | undefined,
  createDeps: DependencyList = [],
): RuntimePersister | undefined {
  return storeHostReact.useCreatePersister(
    instance.rawStore,
    async () => await create(instance),
    createDeps,
  )
}

export function useCreateRuntimeSynchronizer(
  instance: RuntimeStoreInstance,
  create: (
    instance: RuntimeStoreInstance,
  ) => Promise<RuntimeSynchronizer | undefined> | RuntimeSynchronizer | undefined,
  createDeps: DependencyList = [],
): RuntimeSynchronizer | undefined {
  return storeHostReact.useCreateSynchronizer(
    instance.rawStore,
    async () => await create(instance),
    createDeps,
  )
}

export function createStoreReactApi<const Definition extends AnyStoreDefinition>(
  definition: Definition,
): StoreReactApi<Definition> {
  type Schema = DefinitionSchema<Definition>
  const schema = definition.schema as Schema
  const hooks = createStoreHooks(schema, definition.indexIds as DefinitionIndexIds<Definition>)
  const tinybase = UiReact as unknown as UiReact.WithSchemas<StoreSchemasFor<Schema>>

  const api = {
    useCell(tableId: string, rowId: string, cellId: string) {
      return hooks.useCell(tableId as never, rowId, cellId as never, definition.storeId)
    },

    useCellState(tableId: string, rowId: string, cellId: string) {
      return hooks.useCellState(tableId as never, rowId, cellId as never, definition.storeId)
    },

    useEntity(tableId: string, rowId: string) {
      return hooks.useEntity(tableId as never, rowId, definition.storeId)
    },

    useEntityList(tableId: string) {
      return hooks.useEntityList(tableId as never, definition.storeId)
    },

    useHasRow(tableId: string, rowId: string) {
      return hooks.useHasRow(tableId, rowId, definition.storeId)
    },

    useRawIndexes() {
      return tinybase.useIndexes(definition.indexesId) as RawIndexesFor<Schema> | undefined
    },

    useRawPersister() {
      return tinybase.usePersister(definition.persisterId)
    },

    useRawStore() {
      return tinybase.useStore(definition.storeId) as RawStoreFor<Schema> | undefined
    },

    useRawSynchronizer() {
      return tinybase.useSynchronizer(definition.synchronizerId)
    },

    useRow(tableId: string, rowId: string) {
      return hooks.useRow(tableId as never, rowId, definition.storeId)
    },

    useRowIds(tableId: string) {
      return hooks.useRowIds(tableId, definition.storeId)
    },

    useSliceEntities(indexId: string, sliceId: string, tableId: string) {
      return hooks.useSliceEntities(
        indexId as never,
        sliceId,
        tableId as never,
        definition.indexesId,
        definition.storeId,
      )
    },

    useSliceIds(indexId: string) {
      return hooks.useSliceIds(indexId as never, definition.indexesId)
    },

    useSliceRowIds(indexId: string, sliceId: string) {
      return hooks.useSliceRowIds(indexId as never, sliceId, definition.indexesId)
    },

    useValue(valueId: string) {
      return hooks.useValue(valueId as never, definition.storeId)
    },

    useValueState(valueId: string) {
      return hooks.useValueState(valueId as never, definition.storeId)
    },
  }

  return api as unknown as StoreReactApi<Definition>
}
