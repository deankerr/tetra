import type { Store, TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

export type AnyZod = z.ZodType
export type RowZod = z.ZodObject<Record<string, AnyZod>>
export type FieldKind = 'array' | 'boolean' | 'number' | 'object' | 'string'
export type TinybaseStore = Store<[TablesSchema, ValuesSchema]>

export interface TinyCellSchema {
  allowNull?: boolean
  default?: unknown
  type: FieldKind
}

export interface FieldDefinition<Schema extends AnyZod> {
  schema: Schema
  tinySchema: TinyCellSchema
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
export type TableSchemaOf<Table extends TableDefinition<FieldShape>> = Table['schema']

export type EntityOf<Schema extends RowZod> = z.output<Schema> & { id: string }
export type InputRowOf<Schema extends RowZod> = z.input<Schema>
export type OutputRowOf<Schema extends RowZod> = z.output<Schema>

export interface TableApi<Schema extends RowZod> {
  deleteRow(rowId: string): void
  getEntity(rowId: string): EntityOf<Schema> | null
  getRow(rowId: string): OutputRowOf<Schema> | null
  listEntities(): EntityOf<Schema>[]
  listRowIds(): string[]
  requireEntity(rowId: string): EntityOf<Schema>
  setRow(rowId: string, row: InputRowOf<Schema>): EntityOf<Schema>
  updateRow(rowId: string, partialRow: Partial<InputRowOf<Schema>>): EntityOf<Schema>
}

export interface ValueApi<Schema extends AnyZod> {
  deleteValue(): void
  getValue(): z.output<Schema>
  setValue(value: z.input<Schema>): z.output<Schema>
}

export type BoundTinybase<Tables extends TableDefinitions, Values extends ValueDefinitions> = {
  store: TinybaseStore
  getTable<TableId extends keyof Tables & string>(
    tableId: TableId,
  ): TableApi<TableSchemaOf<Tables[TableId]>>
  getValue<ValueId extends keyof Values & string>(
    valueId: ValueId,
  ): ValueApi<Values[ValueId]['schema']>
} & {
  [TableId in keyof Tables]: TableApi<TableSchemaOf<Tables[TableId]>>
}

export interface TinybaseDefinition<
  Tables extends TableDefinitions,
  Values extends ValueDefinitions,
> {
  bindTinybaseStore(store: TinybaseStore): BoundTinybase<Tables, Values>
  createTinybaseStore(): TinybaseStore
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
  tinybaseTablesSchema: TablesSchema
  tinybaseValuesSchema: ValuesSchema
  values: Values
}
