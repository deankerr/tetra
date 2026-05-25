import type { TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'

import type { ValueDefinitions } from './store.ts'
import type { TableDefinitions } from './table.ts'

export type TinybaseTablesSchemaOf<Tables extends TableDefinitions> = {
  [TableId in keyof Tables]: {
    [CellId in keyof Tables[TableId]['fields']]: Tables[TableId]['fields'][CellId]['tinySchema']
  }
} & TablesSchema

export type TinybaseValuesSchemaOf<Values extends ValueDefinitions> = {
  [ValueId in keyof Values]: Values[ValueId]['tinySchema']
} & ValuesSchema

export type TinybaseSchemasOf<Tables extends TableDefinitions, Values extends ValueDefinitions> = [
  TinybaseTablesSchemaOf<Tables>,
  TinybaseValuesSchemaOf<Values>,
]

export function toTinybaseTablesSchema(tables: TableDefinitions): TablesSchema {
  // TinyBase only needs the coarse cell schema nested by table and cell id.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase's schema type is intentionally looser than the typed table definition object.
  return Object.fromEntries(
    Object.entries(tables).map(([tableId, table]) => [
      tableId,
      Object.fromEntries(
        Object.entries(table.fields).map(([cellId, field]) => [cellId, field.tinySchema]),
      ),
    ]),
  ) as TablesSchema
}

export function toTinybaseValuesSchema(values: ValueDefinitions): ValuesSchema {
  // Values use the same coarse TinyBase cell schema shape without a row wrapper.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase's schema type is intentionally looser than the typed value definition object.
  return Object.fromEntries(
    Object.entries(values).map(([valueId, definition]) => [valueId, definition.tinySchema]),
  ) as ValuesSchema
}
