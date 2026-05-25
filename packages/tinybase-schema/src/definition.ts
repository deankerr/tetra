import type { z } from 'zod'

import type { IndexDefinitions } from './indexes.ts'
import { toTinybaseTablesSchema, toTinybaseValuesSchema } from './schema.ts'
import type { TinybaseTablesSchemaOf, TinybaseValuesSchemaOf } from './schema.ts'
import { parseEntity, parseRow, parseValue } from './store.ts'
import type { EntityOf, OutputRowOf, ValueDefinitions } from './store.ts'
import type { TableDefinitions, TableSchemaOf } from './table.ts'
import type { AnyZod } from './types.ts'

export interface TinybaseDefinition<
  Tables extends TableDefinitions,
  Values extends ValueDefinitions,
  IndexDefs extends IndexDefinitions<Tables>,
> {
  getCellSchema<TableId extends keyof Tables & string>(
    tableId: TableId,
    cellId: keyof z.output<TableSchemaOf<Tables[TableId]>> & string,
  ): AnyZod
  parseEntity<TableId extends keyof Tables & string>(
    tableId: TableId,
    rowId: string,
    row: unknown,
  ): EntityOf<TableSchemaOf<Tables[TableId]>>
  parseRow<TableId extends keyof Tables & string>(
    tableId: TableId,
    row: unknown,
  ): OutputRowOf<TableSchemaOf<Tables[TableId]>>
  parseValue<ValueId extends keyof Values & string>(
    valueId: ValueId,
    value: unknown,
  ): z.output<Values[ValueId]['schema']>
  tables: Tables
  indexes: IndexDefs
  tinybaseTablesSchema: TinybaseTablesSchemaOf<Tables>
  tinybaseValuesSchema: TinybaseValuesSchemaOf<Values>
  values: Values
}

// oxlint-disable no-unsafe-type-assertion -- This is the library boundary that binds typed definitions to TinyBase's schema-aware Store.

export function defineTypedTinybase<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions = Record<never, never>,
  const IndexDefs extends IndexDefinitions<Tables> = Record<never, never>,
>({
  indexes,
  tables,
  values,
}: {
  indexes?: IndexDefs
  tables: Tables
  values?: Values
}): TinybaseDefinition<Tables, Values, IndexDefs> {
  // Normalize optional values and indexes once; runtime TinyBase objects remain external.
  const typedValues = (values ?? {}) as Values
  const typedIndexes = (indexes ?? {}) as IndexDefs

  // Produce TinyBase-native schema objects separately from our zod-backed helpers.
  const tinybaseTablesSchema = toTinybaseTablesSchema(tables) as TinybaseTablesSchemaOf<Tables>
  const tinybaseValuesSchema = toTinybaseValuesSchema(typedValues) as TinybaseValuesSchemaOf<Values>

  return {
    getCellSchema(tableId, cellId) {
      return tables[tableId].fields[cellId].schema
    },

    indexes: typedIndexes,

    // oxlint-disable-next-line no-unnecessary-type-parameters -- The contextual interface uses TableId to connect the table id to the returned entity type.
    parseEntity<TableId extends keyof Tables & string>(
      tableId: TableId,
      rowId: string,
      row: unknown,
    ) {
      return parseEntity(tables[tableId].schema, rowId, row) as EntityOf<
        TableSchemaOf<Tables[TableId]>
      >
    },

    parseRow<TableId extends keyof Tables & string>(tableId: TableId, row: unknown) {
      return parseRow(tables[tableId].schema, row) as OutputRowOf<TableSchemaOf<Tables[TableId]>>
    },

    parseValue<ValueId extends keyof Values & string>(valueId: ValueId, value: unknown) {
      return parseValue(typedValues[valueId].schema, value) as z.output<Values[ValueId]['schema']>
    },

    tables,
    tinybaseTablesSchema,
    tinybaseValuesSchema,
    values: typedValues,
  }
}
