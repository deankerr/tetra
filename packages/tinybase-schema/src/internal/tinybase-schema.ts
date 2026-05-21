import type { TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'

import type { TableDefinitions, ValueDefinitions } from '../public/types.ts'

// oxlint-disable no-unsafe-type-assertion -- TinyBase's schema types are structural but require string-indexed object assertions after Object.fromEntries.

export function toTinybaseTablesSchema(tables: TableDefinitions): TablesSchema {
  return Object.fromEntries(
    Object.entries(tables).map(([tableId, definition]) => [
      tableId,
      Object.fromEntries(
        Object.entries(definition.fields).map(([cellId, cell]) => [cellId, cell.tinySchema]),
      ),
    ]),
  ) as TablesSchema
}

export function toTinybaseValuesSchema(values: ValueDefinitions): ValuesSchema {
  return Object.fromEntries(
    Object.entries(values).map(([valueId, definition]) => [valueId, definition.tinySchema]),
  ) as ValuesSchema
}
