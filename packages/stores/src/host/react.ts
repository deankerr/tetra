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
import type { ReactNode } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import type { z } from 'zod'

import { getStoreIndexesId } from './definition.ts'
import type {
  AnyStoreDefinition,
  RawIndexesFor,
  RawStoreFor,
  StoreDefinition,
} from './definition.ts'

// oxlint-disable no-unsafe-return, no-unsafe-type-assertion -- This file adapts TinyBase's generic React hooks to store-bound Tetra hooks.

type DefinitionSchema<Definition extends AnyStoreDefinition> =
  Definition extends StoreDefinition<string, infer Schema, IndexIds> ? Schema : never

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
  storesById?: Record<string, unknown>
}

interface StoreHostReact {
  Provider(props: StoreHostProviderProps): ReactNode
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
  useRawStore(): RawStoreFor<Schema> | undefined
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

export function createStoreReactApi<const Definition extends AnyStoreDefinition>(
  definition: Definition,
): StoreReactApi<Definition> {
  type Schema = DefinitionSchema<Definition>
  const schema = definition.schema as Schema
  const hooks = createStoreHooks(schema, definition.indexIds as DefinitionIndexIds<Definition>)
  const tinybase = UiReact as unknown as UiReact.WithSchemas<StoreSchemasFor<Schema>>
  const indexesId = getStoreIndexesId(definition.id)
  const storeId = definition.id

  const api = {
    useCell(tableId: string, rowId: string, cellId: string) {
      return hooks.useCell(tableId as never, rowId, cellId as never, storeId)
    },

    useCellState(tableId: string, rowId: string, cellId: string) {
      return hooks.useCellState(tableId as never, rowId, cellId as never, storeId)
    },

    useEntity(tableId: string, rowId: string) {
      return hooks.useEntity(tableId as never, rowId, storeId)
    },

    useEntityList(tableId: string) {
      return hooks.useEntityList(tableId as never, storeId)
    },

    useHasRow(tableId: string, rowId: string) {
      return hooks.useHasRow(tableId, rowId, storeId)
    },

    useRawIndexes() {
      return tinybase.useIndexes(indexesId) as RawIndexesFor<Schema> | undefined
    },

    useRawStore() {
      return tinybase.useStore(storeId) as RawStoreFor<Schema> | undefined
    },

    useRow(tableId: string, rowId: string) {
      return hooks.useRow(tableId as never, rowId, storeId)
    },

    useRowIds(tableId: string) {
      return hooks.useRowIds(tableId, storeId)
    },

    useSliceEntities(indexId: string, sliceId: string, tableId: string) {
      return hooks.useSliceEntities(indexId as never, sliceId, tableId as never, indexesId, storeId)
    },

    useSliceIds(indexId: string) {
      return hooks.useSliceIds(indexId as never, indexesId)
    },

    useSliceRowIds(indexId: string, sliceId: string) {
      return hooks.useSliceRowIds(indexId as never, sliceId, indexesId)
    },

    useValue(valueId: string) {
      return hooks.useValue(valueId as never, storeId)
    },

    useValueState(valueId: string) {
      return hooks.useValueState(valueId as never, storeId)
    },
  }

  return api as unknown as StoreReactApi<Definition>
}
