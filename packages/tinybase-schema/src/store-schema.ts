import type { z } from 'zod'

import { toTinybaseTablesSchema, toTinybaseValuesSchema } from './schema.ts'
import type { NativeStoreSchemasOf, NativeTablesSchemaOf, NativeValuesSchemaOf } from './schema.ts'
import { parseEntity, parseRow, parseValue } from './store.ts'
import type { BoundStore, EntityOf, EntityRowsOf, OutputRowOf, ValueDefinitions } from './store.ts'
import type { TableDefinitions, TableSchemaOf } from './table.ts'
import type { AnyZod } from './types.ts'

export interface TypedStoreSchema<
  Tables extends TableDefinitions,
  Values extends ValueDefinitions,
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
  ): z.output<Values[ValueId]>
  tables: Tables
  tablesSchema: NativeTablesSchemaOf<Tables>
  valuesSchema: NativeValuesSchemaOf<Values>
  values: Values
}

export type StoreSchemasFor<Schema extends TypedStoreSchema<TableDefinitions, ValueDefinitions>> =
  Schema extends TypedStoreSchema<infer Tables, infer Values>
    ? NativeStoreSchemasOf<Tables, Values>
    : never

export type StoreApiFor<Schema extends TypedStoreSchema<TableDefinitions, ValueDefinitions>> =
  Schema extends TypedStoreSchema<infer Tables, infer Values> ? BoundStore<Tables, Values> : never

export type StoreRowsFor<Schema extends TypedStoreSchema<TableDefinitions, ValueDefinitions>> =
  Schema extends TypedStoreSchema<infer Tables, ValueDefinitions> ? EntityRowsOf<Tables> : never

export type StoreRowFor<
  Schema extends TypedStoreSchema<TableDefinitions, ValueDefinitions>,
  TableId extends keyof StoreRowsFor<Schema>,
> = StoreRowsFor<Schema>[TableId]

// oxlint-disable no-unsafe-type-assertion -- This is the library boundary that binds typed definitions to TinyBase's schema-aware Store.

export function defineTypedStore<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions = Record<never, never>,
>({ tables, values }: { tables: Tables; values?: Values }): TypedStoreSchema<Tables, Values> {
  // Normalize optional values once; runtime TinyBase objects remain external.
  const typedValues = (values ?? {}) as Values

  // Produce TinyBase-native schema objects separately from our zod-backed helpers.
  const tablesSchema = toTinybaseTablesSchema(tables) as NativeTablesSchemaOf<Tables>
  const valuesSchema = toTinybaseValuesSchema(typedValues) as NativeValuesSchemaOf<Values>

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
      return parseRow(tables[tableId], row) as OutputRowOf<TableSchemaOf<Tables[TableId]>>
    },

    parseValue<ValueId extends keyof Values & string>(valueId: ValueId, value: unknown) {
      return parseValue(typedValues[valueId], value) as z.output<Values[ValueId]>
    },

    tables,
    tablesSchema,
    values: typedValues,
    valuesSchema,
  }
}
