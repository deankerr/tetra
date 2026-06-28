import type { AnyArray, AnyObject } from 'tinybase/common/with-schemas'
import type { z } from 'zod'

export type AnyZod = z.ZodType
export type RowZod = z.ZodObject<Record<string, AnyZod>>
export type FieldKind = 'array' | 'boolean' | 'number' | 'object' | 'string'

export type TinyCellSchema =
  | { allowNull?: boolean; default?: AnyArray | null; type: 'array' }
  | { allowNull?: boolean; default?: boolean | null; type: 'boolean' }
  | { allowNull?: boolean; default?: number | null; type: 'number' }
  | { allowNull?: boolean; default?: AnyObject | null; type: 'object' }
  | { allowNull?: boolean; default?: string | null; type: 'string' }

// Table and value definitions are the zod-keyed maps callers pass to defineStoreSchema.
export type TableDefinitions = Record<string, RowZod>
export type ValueDefinitions = Record<string, AnyZod>
export type TableSchemaOf<Table extends RowZod> = Table
