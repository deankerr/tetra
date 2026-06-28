import type { z } from 'zod'

import { parseEntity } from '../binding/store.ts'
import type { BoundStore, EntityOf, EntityRowsOf, OutputRowOf } from '../binding/store.ts'
import { toTinybaseTablesSchema, toTinybaseValuesSchema } from './emit.ts'
import type {
  TinybaseStoreSchemasOf,
  TinybaseTablesSchemaOf,
  TinybaseValuesSchemaOf,
} from './emit.ts'
import type { AnyZod, TableDefinitions, TableSchemaOf, ValueDefinitions } from './types.ts'

export interface StoreSchema<Tables extends TableDefinitions, Values extends ValueDefinitions> {
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
  ): z.output<Values[ValueId]>
  tables: Tables
  tablesSchema: TinybaseTablesSchemaOf<Tables>
  valuesSchema: TinybaseValuesSchemaOf<Values>
  values: Values
}

export type TinybaseSchemasFor<Schema extends StoreSchema<TableDefinitions, ValueDefinitions>> =
  Schema extends StoreSchema<infer Tables, infer Values>
    ? TinybaseStoreSchemasOf<Tables, Values>
    : never

export type BoundStoreFor<Schema extends StoreSchema<TableDefinitions, ValueDefinitions>> =
  Schema extends StoreSchema<infer Tables, infer Values> ? BoundStore<Tables, Values> : never

export type StoreRowsFor<Schema extends StoreSchema<TableDefinitions, ValueDefinitions>> =
  Schema extends StoreSchema<infer Tables, ValueDefinitions> ? EntityRowsOf<Tables> : never

// oxlint-disable no-unsafe-type-assertion -- This is the library boundary that binds typed definitions to TinyBase's schema-aware Store.

export function defineStoreSchema<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions = Record<never, never>,
>({ tables, values }: { tables: Tables; values?: Values }): StoreSchema<Tables, Values> {
  // Normalize optional values once; runtime TinyBase objects remain external.
  const valueDefs = (values ?? {}) as Values

  // Produce TinyBase-native schema objects separately from our zod-backed helpers.
  const tablesSchema = toTinybaseTablesSchema(tables) as TinybaseTablesSchemaOf<Tables>
  const valuesSchema = toTinybaseValuesSchema(valueDefs) as TinybaseValuesSchemaOf<Values>

  return {
    getCellSchema(tableId, cellId) {
      return tables[tableId].shape[cellId]
    },

    // oxlint-disable-next-line no-unnecessary-type-parameters -- The contextual interface uses TableId to connect the table id to the returned entity type.
    parseEntity<TableId extends keyof Tables & string>(
      tableId: TableId,
      rowId: string,
      row: unknown,
    ) {
      return parseEntity(tables[tableId], rowId, row) as EntityOf<TableSchemaOf<Tables[TableId]>>
    },

    parseRow<TableId extends keyof Tables & string>(tableId: TableId, row: unknown) {
      return tables[tableId].parse(row) as OutputRowOf<TableSchemaOf<Tables[TableId]>>
    },

    parseValue<ValueId extends keyof Values & string>(valueId: ValueId, value: unknown) {
      return valueDefs[valueId].parse(value) as z.output<Values[ValueId]>
    },

    tables,
    tablesSchema,
    values: valueDefs,
    valuesSchema,
  }
}
