import type { TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

import type {
  AnyZod,
  CellOutputOf,
  InputRowOf,
  OutputRowOf,
  RowZod,
  TableApi,
  TinybaseStore,
  ValueApi,
} from '../public/types.ts'

// oxlint-disable no-unsafe-argument, no-unsafe-return, no-unsafe-type-assertion -- TinyBase stores coarse cells; zod owns the precise boundary parse.

export function createTableApi<Schemas extends [TablesSchema, ValuesSchema], Schema extends RowZod>(
  store: TinybaseStore<Schemas>,
  tableId: string,
  schema: Schema,
): TableApi<Schema> {
  return {
    deleteRow(rowId) {
      store.delRow(tableId, rowId)
    },

    getCell(rowId, cellId) {
      if (!store.hasRow(tableId, rowId)) {
        return undefined as CellOutputOf<Schema, typeof cellId> | undefined
      }

      const cellSchema = schema.shape[cellId]
      return cellSchema.parse(store.getCell(tableId, rowId, cellId)) as CellOutputOf<
        Schema,
        typeof cellId
      >
    },

    getEntity(rowId) {
      if (!store.hasRow(tableId, rowId)) {
        return null
      }

      const parsed = schema.parse(store.getRow(tableId, rowId))
      return { ...parsed, id: rowId }
    },

    getRow(rowId) {
      if (!store.hasRow(tableId, rowId)) {
        return null
      }

      return schema.parse(store.getRow(tableId, rowId))
    },

    getRowIds() {
      return store.getRowIds(tableId)
    },

    hasRow(rowId) {
      return store.hasRow(tableId, rowId)
    },

    listEntities() {
      return store.getRowIds(tableId).map((rowId) => this.requireEntity(rowId))
    },

    requireEntity(rowId) {
      const entity = this.getEntity(rowId)
      if (entity === null) {
        throw new Error(`Missing row: ${tableId}/${rowId}`)
      }

      return entity
    },

    setCell(rowId, cellId, value) {
      const cellSchema = schema.shape[cellId]
      const parsed = cellSchema.parse(value)
      store.setCell(tableId, rowId, cellId, parsed as never)
      return parsed as CellOutputOf<Schema, typeof cellId>
    },

    setRow(rowId, row) {
      const parsed = schema.parse(row)
      store.setRow(tableId, rowId, parsed as never)
      return { ...parsed, id: rowId }
    },

    updateRow(rowId, partialRow) {
      const existing = this.getRow(rowId)
      if (existing === null) {
        throw new Error(`Missing row: ${tableId}/${rowId}`)
      }

      return this.setRow(rowId, { ...existing, ...partialRow } as InputRowOf<Schema>)
    },
  }
}

export function createValueApi<Schemas extends [TablesSchema, ValuesSchema], Schema extends AnyZod>(
  store: TinybaseStore<Schemas>,
  valueId: string,
  schema: Schema,
): ValueApi<Schema> {
  return {
    deleteValue() {
      store.delValue(valueId)
    },

    getValue() {
      return schema.parse(store.getValue(valueId))
    },

    setValue(value) {
      const parsed = schema.parse(value)
      store.setValue(valueId, parsed as never)
      return parsed
    },
  }
}

export function parseEntity<Schema extends RowZod>(schema: Schema, rowId: string, row: unknown) {
  const parsed = schema.parse(row) as OutputRowOf<Schema>
  return { ...parsed, id: rowId }
}

export function parseRow<Schema extends RowZod>(schema: Schema, row: unknown) {
  return schema.parse(row) as OutputRowOf<Schema>
}

export function parseValue<Schema extends AnyZod>(schema: Schema, value: unknown) {
  return schema.parse(value) as z.output<Schema>
}
