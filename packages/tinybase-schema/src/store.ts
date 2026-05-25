import type { Store, TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

import type { TableDefinitions, TableSchemaOf } from './table.ts'
import type { AnyZod, FieldDefinition, RowZod } from './types.ts'

export type TinybaseStore<
  Schemas extends [TablesSchema, ValuesSchema] = [TablesSchema, ValuesSchema],
> = Store<Schemas>

export type ValueDefinitions = Record<string, FieldDefinition<AnyZod>>
export type EntityOf<Schema extends RowZod> = z.output<Schema> & { id: string }
export type InputRowOf<Schema extends RowZod> = z.input<Schema>
export type OutputRowOf<Schema extends RowZod> = z.output<Schema>

export type CellInputOf<
  Schema extends RowZod,
  CellId extends keyof z.input<Schema> & string,
> = z.input<Schema>[CellId]

export type CellOutputOf<
  Schema extends RowZod,
  CellId extends keyof z.output<Schema> & string,
> = z.output<Schema>[CellId]

export interface TableApi<Schema extends RowZod> {
  deleteRow(rowId: string): void
  getEntity(rowId: string): EntityOf<Schema> | null
  getRow(rowId: string): OutputRowOf<Schema> | null
  getRowIds(): string[]
  getCell<CellId extends keyof z.output<Schema> & string>(
    rowId: string,
    cellId: CellId,
  ): CellOutputOf<Schema, CellId> | undefined
  hasRow(rowId: string): boolean
  listEntities(): EntityOf<Schema>[]
  requireEntity(rowId: string): EntityOf<Schema>
  setCell<CellId extends keyof z.input<Schema> & keyof z.output<Schema> & string>(
    rowId: string,
    cellId: CellId,
    value: CellInputOf<Schema, CellId>,
  ): CellOutputOf<Schema, CellId>
  setRow(rowId: string, row: InputRowOf<Schema>): EntityOf<Schema>
  updateRow(rowId: string, partialRow: Partial<InputRowOf<Schema>>): EntityOf<Schema>
}

export interface ValueApi<Schema extends AnyZod> {
  delete(): void
  get(): z.output<Schema>
  set(value: z.input<Schema>): z.output<Schema>
}

export interface BoundTinybase<Tables extends TableDefinitions, Values extends ValueDefinitions> {
  tables: BoundTableApis<Tables>
  values: BoundValueApis<Values>
}

export type BoundTableApis<Tables extends TableDefinitions> = {
  get<TableId extends keyof Tables & string>(
    tableId: TableId,
  ): TableApi<TableSchemaOf<Tables[TableId]>>
} & {
  [TableId in keyof Tables]: TableApi<TableSchemaOf<Tables[TableId]>>
}

export type BoundValueApis<Values extends ValueDefinitions> = {
  get<ValueId extends keyof Values & string>(valueId: ValueId): ValueApi<Values[ValueId]['schema']>
} & {
  [ValueId in keyof Values]: ValueApi<Values[ValueId]['schema']>
}

// oxlint-disable no-unsafe-argument, no-unsafe-return, no-unsafe-type-assertion -- TinyBase stores coarse cells; zod owns the precise boundary parse.

export function bindTinybaseStore<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions,
  Schemas extends [TablesSchema, ValuesSchema],
>(store: Store<Schemas>, tables: Tables, values: Values): BoundTinybase<Tables, Values> {
  // Table APIs are addressable both by `get(tableId)` and by named properties.
  const tablesApi = {
    get<TableId extends keyof Tables & string>(
      tableId: TableId,
    ): TableApi<TableSchemaOf<Tables[TableId]>> {
      return createTableApi(store, tableId, tables[tableId].schema)
    },
  }

  const tableAccessors = Object.fromEntries(
    (Object.keys(tables) as (keyof Tables & string)[]).map((tableId) => [
      tableId,
      createTableApi(store, tableId, tables[tableId].schema),
    ]),
  )

  // Value APIs mirror table APIs, but TinyBase values live outside tables.
  const valuesApi = {
    get<ValueId extends keyof Values & string>(
      valueId: ValueId,
    ): ValueApi<Values[ValueId]['schema']> {
      return createValueApi(store, valueId, values[valueId].schema)
    },
  }

  const valueAccessors = Object.fromEntries(
    (Object.keys(values) as (keyof Values & string)[]).map((valueId) => [
      valueId,
      createValueApi(store, valueId, values[valueId].schema),
    ]),
  )

  return {
    tables: Object.assign(tablesApi, tableAccessors),
    values: Object.assign(valuesApi, valueAccessors),
  } as BoundTinybase<Tables, Values>
}

export function createTableApi<Schemas extends [TablesSchema, ValuesSchema], Schema extends RowZod>(
  store: Store<Schemas>,
  tableId: string,
  schema: Schema,
): TableApi<Schema> {
  return {
    deleteRow(rowId) {
      store.delRow(tableId, rowId)
    },

    getCell<CellId extends keyof z.output<Schema> & string>(
      rowId: string,
      cellId: CellId,
    ): CellOutputOf<Schema, CellId> | undefined {
      if (!store.hasCell(tableId, rowId, cellId)) {
        return undefined
      }

      const cellSchema = schema.shape[cellId]
      return cellSchema.parse(store.getCell(tableId, rowId, cellId)) as CellOutputOf<Schema, CellId>
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
      return [...store.getRowIds(tableId)]
    },

    hasRow(rowId) {
      return store.hasRow(tableId, rowId)
    },

    listEntities() {
      return store.getRowIds(tableId).map((rowId) => {
        const parsed = schema.parse(store.getRow(tableId, rowId))
        return { ...parsed, id: rowId }
      })
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
      const current = this.requireEntity(rowId)
      const { id: _id, ...currentRow } = current
      const nextRow = schema.parse({ ...currentRow, ...partialRow })
      store.setRow(tableId, rowId, nextRow as never)
      return { ...nextRow, id: rowId }
    },
  }
}

export function createValueApi<Schemas extends [TablesSchema, ValuesSchema], Schema extends AnyZod>(
  store: Store<Schemas>,
  valueId: string,
  schema: Schema,
): ValueApi<Schema> {
  return {
    delete() {
      store.delValue(valueId)
    },

    get() {
      return schema.parse(store.getValue(valueId))
    },

    set(value) {
      const parsed = schema.parse(value)
      store.setValue(valueId, parsed as never)
      return parsed
    },
  }
}

export function parseEntity<Schema extends RowZod>(schema: Schema, rowId: string, row: unknown) {
  const parsed = schema.parse(row)
  return { ...parsed, id: rowId }
}

export function parseRow<Schema extends RowZod>(schema: Schema, row: unknown) {
  return schema.parse(row)
}

export function parseValue<Schema extends AnyZod>(schema: Schema, value: unknown) {
  return schema.parse(value) as z.output<Schema>
}
