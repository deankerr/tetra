import { useCallback, useMemo } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import type { z } from 'zod'

import type {
  EntityOf,
  FieldDefinition,
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

const tinyHooks = UiReact as unknown as LooseHooks

export function createTypedTinybaseReactHooks<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions,
>(definition: TinybaseDefinition<Tables, Values>) {
  return {
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

    useValue<ValueId extends keyof Values & string>(
      valueId: ValueId,
    ): z.output<Values[ValueId]['schema']> {
      const value = tinyHooks.useValue(valueId)
      return useMemo(() => definition.parseValue(valueId, value), [value, valueId])
    },
  }
}
