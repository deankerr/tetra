import type { AnyArray, AnyObject } from 'tinybase/common/with-schemas'
import type { z } from 'zod'

// Authoring vocabulary: a table is a zod object, a value is any zod schema.
export type AnyZod = z.ZodType
export type RowZod = z.ZodObject<Record<string, AnyZod>>
export type FieldKind = 'array' | 'boolean' | 'number' | 'object' | 'string'

export type TableDefinitions = Record<string, RowZod>
export type ValueDefinitions = Record<string, AnyZod>

// The coarse TinyBase cell schema we emit alongside each zod cell.
export type TinyCellSchema =
  | { allowNull?: boolean; default?: AnyArray | null; type: 'array' }
  | { allowNull?: boolean; default?: boolean | null; type: 'boolean' }
  | { allowNull?: boolean; default?: number | null; type: 'number' }
  | { allowNull?: boolean; default?: AnyObject | null; type: 'object' }
  | { allowNull?: boolean; default?: string | null; type: 'string' }

// A query is declared as a slice over one plain cell, optionally sorted by another.
// `on`/`sort` are constrained to the owning table's cell ids so the schema stays the
// single source of truth — query method names and arg types are inferred from here.
export interface IndexDecl<Table extends RowZod> {
  desc?: boolean
  on: keyof z.output<Table> & string
  sort?: keyof z.output<Table> & string
}

export type IndexDefinitions<Tables extends TableDefinitions> = {
  [TableId in keyof Tables]?: Record<string, IndexDecl<Tables[TableId]>>
}

// The entity is the universal currency: a parsed row joined with its synthetic id.
// New<Table> is the writable input (z.input — defaulted cells optional, no id).
export type EntityOf<Table extends RowZod> = { id: string } & z.output<Table>
export type NewOf<Table extends RowZod> = z.input<Table>

// Loose runtime contracts for the raw TinyBase Store/Indexes. zod owns the precise
// boundary parse; these only describe the coarse calls the accessors make.
export interface StoreApi {
  delRow(tableId: string, rowId: string): unknown
  delValue(valueId: string): unknown
  getRow(tableId: string, rowId: string): unknown
  getRowIds(tableId: string): string[]
  getValue(valueId: string): unknown
  hasRow(tableId: string, rowId: string): boolean
  setCell(tableId: string, rowId: string, cellId: string, cell: never): unknown
  setRow(tableId: string, rowId: string, row: never): unknown
  setValue(valueId: string, value: never): unknown
  transaction(fn: () => void): unknown
}

export interface IndexesApi {
  getSliceRowIds(indexId: string, sliceId: string): string[]
}
