import type { Ids, SortKey } from 'tinybase/common/with-schemas'
import type { Indexes as TinyIndexes } from 'tinybase/indexes/with-schemas'
import type { Store, TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

export type AnyZod = z.ZodType
export type RowZod = z.ZodObject<Record<string, AnyZod>>
export type FieldKind = 'array' | 'boolean' | 'number' | 'object' | 'string'
export type TinybaseStore<
  Schemas extends [TablesSchema, ValuesSchema] = [TablesSchema, ValuesSchema],
> = Store<Schemas>
export type TinybaseIndexes<
  Schemas extends [TablesSchema, ValuesSchema] = [TablesSchema, ValuesSchema],
> = TinyIndexes<Schemas>

export interface TinyCellSchema {
  allowNull?: boolean
  default?: unknown
  type: FieldKind
}

export interface FieldDefinition<
  Schema extends AnyZod,
  TinySchema extends TinyCellSchema = TinyCellSchema,
> {
  schema: Schema
  tinySchema: TinySchema
}

export interface FieldOptions<Default> {
  allowNull?: boolean
  default?: Default
}

export type FieldShape = Record<string, FieldDefinition<AnyZod>>

export interface TableDefinition<Fields extends FieldShape> {
  fields: Fields
  schema: z.ZodObject<{ [Key in keyof Fields]: Fields[Key]['schema'] }>
}

export type TableDefinitions = Record<string, TableDefinition<FieldShape>>
export type ValueDefinitions = Record<string, FieldDefinition<AnyZod>>
export type IndexDefinitions<Tables extends TableDefinitions> = Record<
  string,
  IndexDefinition<Tables, keyof Tables & string>
>
export type TableSchemaOf<Table extends TableDefinition<FieldShape>> = Table['schema']
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
export type IndexCellId<
  Tables extends TableDefinitions,
  TableId extends keyof Tables & string,
> = keyof z.output<TableSchemaOf<Tables[TableId]>> & string

export interface IndexDefinition<
  Tables extends TableDefinitions,
  TableId extends keyof Tables & string,
> {
  rowIdSorter?: (sortKey1: SortKey, sortKey2: SortKey, sliceId: string) => number
  sliceBy?: IndexCellId<Tables, TableId>
  sliceIdSorter?: (sliceId1: string, sliceId2: string) => number
  sortBy?: IndexCellId<Tables, TableId>
  tableId: TableId
}

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
  deleteValue(): void
  getValue(): z.output<Schema>
  setValue(value: z.input<Schema>): z.output<Schema>
}

export interface IndexApi {
  getSliceIds(): Ids
  getSliceRowIds(sliceId: string): Ids
}

export type BoundIndexes<IndexDefs extends Record<string, unknown>> = {
  raw: TinybaseIndexes
  getIndex(indexId: keyof IndexDefs & string): IndexApi
  getSliceIds(indexId: keyof IndexDefs & string): Ids
  getSliceRowIds(indexId: keyof IndexDefs & string, sliceId: string): Ids
} & {
  [IndexId in keyof IndexDefs]: IndexApi
}

export type BoundTinybase<Tables extends TableDefinitions, Values extends ValueDefinitions> = {
  store: TinybaseStore<TinybaseSchemasOf<Tables, Values>>
  getTable<TableId extends keyof Tables & string>(
    tableId: TableId,
  ): TableApi<TableSchemaOf<Tables[TableId]>>
  getValue<ValueId extends keyof Values & string>(
    valueId: ValueId,
  ): ValueApi<Values[ValueId]['schema']>
  transaction(fn: () => void): void
} & {
  [TableId in keyof Tables]: TableApi<TableSchemaOf<Tables[TableId]>>
}

export interface TinybaseDefinition<
  Tables extends TableDefinitions,
  Values extends ValueDefinitions,
  IndexDefs extends IndexDefinitions<Tables>,
> {
  bindTinybaseIndexes(
    indexes: TinybaseIndexes<TinybaseSchemasOf<Tables, Values>>,
  ): BoundIndexes<IndexDefs>
  bindTinybaseStore(
    store: TinybaseStore<TinybaseSchemasOf<Tables, Values>>,
  ): BoundTinybase<Tables, Values>
  createTinybaseIndexes(
    store: TinybaseStore<TinybaseSchemasOf<Tables, Values>>,
  ): TinybaseIndexes<TinybaseSchemasOf<Tables, Values>>
  createTinybaseStore(): TinybaseStore<TinybaseSchemasOf<Tables, Values>>
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
