import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import type { z } from 'zod'

import type { IndexIds } from './indexes.ts'
import type { AnyStoreDefinition } from './runtime.ts'
import type { TypedStoreSchema } from './store-schema.ts'
import type { CellOutputOf, EntityOf, OutputRowOf, ValueDefinitions } from './store.ts'
import type { TableDefinitions, TableSchemaOf } from './table.ts'

// oxlint-disable no-unsafe-return, no-unsafe-type-assertion -- React hooks cross from TinyBase's coarse schema into zod-derived row types.

type LooseHooks = UiReact.WithSchemas<
  [Record<string, Record<string, { type: 'any' }>>, Record<string, { type: 'any' }>]
>

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

const tinyHooks = UiReact as unknown as LooseHooks
type LooseIndexesOrIndexesId = Parameters<LooseHooks['useSliceRowIds']>[2]
type LooseStoreOrStoreId = Parameters<LooseHooks['useValue']>[1]

type DefinitionSchema<Definition extends AnyStoreDefinition> = Definition['schema']
type DefinitionIndexIds<Definition extends AnyStoreDefinition> = Definition['indexIds']

type TablesOf<Schema> =
  Schema extends TypedStoreSchema<infer Tables, ValueDefinitions> ? Tables : never

type ValuesOf<Schema> =
  Schema extends TypedStoreSchema<TableDefinitions, infer Values> ? Values : never

interface StoreProviderProps {
  children: ReactNode
  indexesById?: Record<string, unknown>
  storesById?: Record<string, unknown>
}

type ProviderStoreInstances = Record<
  string,
  {
    id: string
    rawIndexes: unknown
    rawStore: unknown
  }
>

interface TinyBaseReactProvider {
  Provider(props: StoreProviderProps): ReactNode
}

const tinybaseReactProvider = UiReact as unknown as TinyBaseReactProvider

function getStoreIndexesId<const Id extends string>(storeId: Id): `${Id}Indexes` {
  return `${storeId}Indexes`
}

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

export function StoreProvider(props: StoreProviderProps): ReactNode {
  return tinybaseReactProvider.Provider(props)
}

export function createTinyBaseProviderProps(host: ProviderStoreInstances) {
  // TinyBase React names stores and indexes separately, so derive provider props from store ids.
  return {
    indexesById: Object.fromEntries(
      Object.values(host).map((instance) => [getStoreIndexesId(instance.id), instance.rawIndexes]),
    ),
    storesById: Object.fromEntries(
      Object.values(host).map((instance) => [instance.id, instance.rawStore]),
    ),
  }
}

function createStoreHooks<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions,
  const IndexIdList extends IndexIds,
>(storeSchema: TypedStoreSchema<Tables, Values>, indexIds: IndexIdList) {
  void indexIds

  return {
    useCell<
      TableId extends keyof Tables & string,
      CellId extends keyof z.output<TableSchemaOf<Tables[TableId]>> & string,
    >(
      tableId: TableId,
      rowId: string,
      cellId: CellId,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): CellOutputOf<TableSchemaOf<Tables[TableId]>, CellId> | undefined {
      const cell = tinyHooks.useCell(tableId, rowId, cellId, storeOrStoreId)
      const cellSchema = storeSchema.getCellSchema(tableId, cellId)

      return useMemo(
        () =>
          cell === undefined
            ? undefined
            : (cellSchema.parse(cell) as CellOutputOf<TableSchemaOf<Tables[TableId]>, CellId>),
        [cell, cellSchema],
      )
    },

    useCellState<
      TableId extends keyof Tables & string,
      CellId extends keyof z.output<TableSchemaOf<Tables[TableId]>> &
        keyof z.input<TableSchemaOf<Tables[TableId]>> &
        string,
    >(
      tableId: TableId,
      rowId: string,
      cellId: CellId,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): [
      CellOutput<Tables, TableId, CellId> | undefined,
      (value: CellInput<Tables, TableId, CellId>) => void,
    ] {
      const [cell, setCell] = tinyHooks.useCellState(tableId, rowId, cellId, storeOrStoreId)
      const cellSchema = storeSchema.getCellSchema(tableId, cellId)

      const parsedCell = useMemo<CellOutput<Tables, TableId, CellId> | undefined>(
        () =>
          cell === undefined
            ? undefined
            : (cellSchema.parse(cell) as CellOutput<Tables, TableId, CellId>),
        [cell, cellSchema],
      )

      const setParsedCell = useCallback(
        (value: CellInput<Tables, TableId, CellId>) => {
          setCell(cellSchema.parse(value) as Parameters<typeof setCell>[0])
        },
        [cellSchema, setCell],
      )

      return [parsedCell, setParsedCell]
    },

    useEntity<TableId extends keyof Tables & string>(
      tableId: TableId,
      rowId: string,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): EntityOf<TableSchemaOf<Tables[TableId]>> | null {
      const hasRow = tinyHooks.useHasRow(tableId, rowId, storeOrStoreId)
      const row = tinyHooks.useRow(tableId, rowId, storeOrStoreId)

      return useMemo(() => {
        if (!hasRow) {
          return null
        }

        return storeSchema.parseEntity(tableId, rowId, row)
      }, [hasRow, row, rowId, tableId])
    },

    useEntityList<TableId extends keyof Tables & string>(
      tableId: TableId,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): EntityOf<TableSchemaOf<Tables[TableId]>>[] {
      const table = tinyHooks.useTable(tableId, storeOrStoreId)

      return useMemo(
        () =>
          Object.entries(table).map(([rowId, row]) => storeSchema.parseEntity(tableId, rowId, row)),
        [table, tableId],
      )
    },

    useHasRow(
      tableId: keyof Tables & string,
      rowId: string,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): boolean {
      return tinyHooks.useHasRow(tableId, rowId, storeOrStoreId)
    },

    useRow<TableId extends keyof Tables & string>(
      tableId: TableId,
      rowId: string,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): OutputRowOf<TableSchemaOf<Tables[TableId]>> | null {
      const hasRow = tinyHooks.useHasRow(tableId, rowId, storeOrStoreId)
      const row = tinyHooks.useRow(tableId, rowId, storeOrStoreId)

      return useMemo(() => {
        if (!hasRow) {
          return null
        }

        return storeSchema.parseRow(tableId, row)
      }, [hasRow, row, tableId])
    },

    useRowIds(tableId: keyof Tables & string, storeOrStoreId?: LooseStoreOrStoreId): string[] {
      return tinyHooks.useRowIds(tableId, storeOrStoreId)
    },

    useSliceEntities<TableId extends keyof Tables & string>(
      indexId: IndexIdList[number],
      sliceId: string,
      tableId: TableId,
      indexesOrIndexesId?: LooseIndexesOrIndexesId,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): EntityOf<TableSchemaOf<Tables[TableId]>>[] {
      const rowIds = tinyHooks.useSliceRowIds(indexId, sliceId, indexesOrIndexesId)
      const table = tinyHooks.useTable(tableId, storeOrStoreId)

      // Slice entity reads compose index membership with table content subscriptions.
      return useMemo(
        () =>
          rowIds.flatMap((rowId) => {
            if (!(rowId in table)) {
              return []
            }

            return [storeSchema.parseEntity(tableId, rowId, table[rowId])]
          }),
        [rowIds, table, tableId],
      )
    },

    useSliceIds(
      indexId: IndexIdList[number],
      indexesOrIndexesId?: LooseIndexesOrIndexesId,
    ): string[] {
      return tinyHooks.useSliceIds(indexId, indexesOrIndexesId)
    },

    useSliceRowIds(
      indexId: IndexIdList[number],
      sliceId: string,
      indexesOrIndexesId?: LooseIndexesOrIndexesId,
    ): string[] {
      return tinyHooks.useSliceRowIds(indexId, sliceId, indexesOrIndexesId)
    },

    useValue<ValueId extends keyof Values & string>(
      valueId: ValueId,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): ValueOutput<Values, ValueId> {
      const value = tinyHooks.useValue(valueId, storeOrStoreId)
      return useMemo(() => storeSchema.parseValue(valueId, value), [value, valueId])
    },

    useValueState<ValueId extends keyof Values & string>(
      valueId: ValueId,
      storeOrStoreId?: LooseStoreOrStoreId,
    ): [ValueOutput<Values, ValueId>, (value: ValueInput<Values, ValueId>) => void] {
      const [value, setValue] = tinyHooks.useValueState(valueId, storeOrStoreId)
      const valueSchema = storeSchema.values[valueId]

      const parsedValue = useMemo<ValueOutput<Values, ValueId>>(
        () => storeSchema.parseValue(valueId, value),
        [value, valueId],
      )

      const setParsedValue = useCallback(
        (nextValue: ValueInput<Values, ValueId>) => {
          setValue(valueSchema.parse(nextValue) as Parameters<typeof setValue>[0])
        },
        [setValue, valueSchema],
      )

      return [parsedValue, setParsedValue]
    },
  }
}

export function createStoreReactApi<const Definition extends AnyStoreDefinition>(
  definition: Definition,
): StoreReactApi<Definition> {
  type Schema = DefinitionSchema<Definition>
  const schema = definition.schema as Schema
  const hooks = createStoreHooks(schema, definition.indexIds as DefinitionIndexIds<Definition>)
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
