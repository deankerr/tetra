import type { z } from 'zod'

import type {
  AnyZod,
  InputRowOf,
  OutputRowOf,
  RowZod,
  TableApi,
  TinybaseStore,
  ValueApi,
} from '../public/types.ts'

// oxlint-disable no-unsafe-argument, no-unsafe-return, no-unsafe-type-assertion -- TinyBase stores coarse cells; zod owns the precise boundary parse.

export function createTableApi<Schema extends RowZod>(
  store: TinybaseStore,
  tableId: string,
  schema: Schema,
): TableApi<Schema> {
  return {
    deleteRow(rowId) {
      store.delRow(tableId, rowId)
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

    listEntities() {
      return store.getRowIds(tableId).map((rowId) => this.requireEntity(rowId))
    },

    listRowIds() {
      return store.getRowIds(tableId)
    },

    requireEntity(rowId) {
      const entity = this.getEntity(rowId)
      if (entity === null) {
        throw new Error(`Missing row: ${tableId}/${rowId}`)
      }

      return entity
    },

    setRow(rowId, row) {
      const parsed = schema.parse(row)
      store.setRow(tableId, rowId, parsed as never)
      return { ...parsed, id: rowId }
    },

    updateRow(rowId, partialRow) {
      const existing = (this.getRow(rowId) ?? {}) as Record<string, unknown>
      return this.setRow(rowId, { ...existing, ...partialRow } as InputRowOf<Schema>)
    },
  }
}

export function createValueApi<Schema extends AnyZod>(
  store: TinybaseStore,
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
