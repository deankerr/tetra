import { useCallback, useMemo } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import type { z } from 'zod'

import type {
  CellOutputOf,
  EntityOf,
  IndexIds,
  OutputRowOf,
  TableDefinitions,
  TableSchemaOf,
  TypedStoreSchema,
  ValueDefinitions,
} from './index.ts'

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

export function createStoreHooks<
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
