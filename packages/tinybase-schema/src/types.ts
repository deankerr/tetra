import type { AnyArray, AnyObject } from 'tinybase/common/with-schemas'
import type { z } from 'zod'

export type AnyZod = z.ZodType
export type RowZod = z.ZodObject<Record<string, AnyZod>>
export type FieldKind = 'array' | 'boolean' | 'number' | 'object' | 'string'

export type TinyCellSchema =
  | { allowNull?: boolean; default?: AnyArray; type: 'array' }
  | { allowNull?: boolean; default?: boolean; type: 'boolean' }
  | { allowNull?: boolean; default?: number; type: 'number' }
  | { allowNull?: boolean; default?: AnyObject; type: 'object' }
  | { allowNull?: boolean; default?: string; type: 'string' }
