import { useCallback, useMemo } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import type { z } from 'zod'

import type {
  CellOutputOf,
  EntityOf,
  FieldDefinition,
  IndexDefinitions,
  OutputRowOf,
  TableDefinition,
  TableDefinitions,
  TinybaseDefinition,
  ValueDefinitions,
} from './index.ts'

// oxlint-disable no-unsafe-return, no-unsafe-type-assertion -- React hooks cross from TinyBase's coarse schema into zod-derived row types.

type LooseHooks = UiReact.WithSchemas<
  [Record<string, Record<string, { type: 'any' }>>, Record<string, { type: 'any' }>]
>
type TableSchemaOf<Table extends TableDefinition<Record<string, FieldDefinition<z.ZodType>>>> =
  Table['schema']

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
  Values[ValueId]['schema']
>

type ValueOutput<Values extends ValueDefinitions, ValueId extends keyof Values & string> = z.output<
  Values[ValueId]['schema']
>

const tinyHooks = UiReact as unknown as LooseHooks

export function createTypedTinybaseReactHooks<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions,
  const Indexes extends IndexDefinitions<Tables>,
>(definition: TinybaseDefinition<Tables, Values, Indexes>) {
  return {
    useCell<
      TableId extends keyof Tables & string,
      CellId extends keyof z.output<TableSchemaOf<Tables[TableId]>> & string,
    >(
      tableId: TableId,
      rowId: string,
      cellId: CellId,
    ): CellOutputOf<TableSchemaOf<Tables[TableId]>, CellId> | undefined {
      const cell = tinyHooks.useCell(tableId, rowId, cellId)
      const cellSchema = definition.getCellSchema(tableId, cellId)

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
    ): [
      CellOutput<Tables, TableId, CellId> | undefined,
      (value: CellInput<Tables, TableId, CellId>) => void,
    ] {
      const [cell, setCell] = tinyHooks.useCellState(tableId, rowId, cellId)
      const cellSchema = definition.getCellSchema(tableId, cellId)

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
    ): EntityOf<TableSchemaOf<Tables[TableId]>> | null {
      const hasRow = tinyHooks.useHasRow(tableId, rowId)
      const row = tinyHooks.useRow(tableId, rowId)

      return useMemo(() => {
        if (!hasRow) {
          return null
        }

        return definition.parseEntity(tableId, rowId, row)
      }, [hasRow, row, rowId, tableId])
    },

    useEntityList<TableId extends keyof Tables & string>(
      tableId: TableId,
    ): EntityOf<TableSchemaOf<Tables[TableId]>>[] {
      const table = tinyHooks.useTable(tableId)

      return useMemo(
        () =>
          Object.entries(table).map(([rowId, row]) => definition.parseEntity(tableId, rowId, row)),
        [table, tableId],
      )
    },

    useHasRow(tableId: keyof Tables & string, rowId: string): boolean {
      return tinyHooks.useHasRow(tableId, rowId)
    },

    useRow<TableId extends keyof Tables & string>(
      tableId: TableId,
      rowId: string,
    ): OutputRowOf<TableSchemaOf<Tables[TableId]>> | null {
      const hasRow = tinyHooks.useHasRow(tableId, rowId)
      const row = tinyHooks.useRow(tableId, rowId)

      return useMemo(() => {
        if (!hasRow) {
          return null
        }

        return definition.parseRow(tableId, row)
      }, [hasRow, row, tableId])
    },

    useSliceRowIds(indexId: keyof Indexes & string, sliceId: string): string[] {
      return tinyHooks.useSliceRowIds(indexId, sliceId)
    },

    useValue<ValueId extends keyof Values & string>(
      valueId: ValueId,
    ): ValueOutput<Values, ValueId> {
      const value = tinyHooks.useValue(valueId)
      return useMemo(() => definition.parseValue(valueId, value), [value, valueId])
    },

    useValueState<ValueId extends keyof Values & string>(
      valueId: ValueId,
    ): [ValueOutput<Values, ValueId>, (value: ValueInput<Values, ValueId>) => void] {
      const [value, setValue] = tinyHooks.useValueState(valueId)
      const valueSchema = definition.values[valueId].schema

      const parsedValue = useMemo<ValueOutput<Values, ValueId>>(
        () => definition.parseValue(valueId, value),
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
