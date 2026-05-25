import type { z } from 'zod'

export type AnyZod = z.ZodType
export type RowZod = z.ZodObject<Record<string, AnyZod>>
export type FieldKind = 'array' | 'boolean' | 'number' | 'object' | 'string'

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
