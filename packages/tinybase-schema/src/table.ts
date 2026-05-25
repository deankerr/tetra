import { z } from 'zod'

import type { AnyZod, FieldDefinition } from './types.ts'

export type FieldShape = Record<string, FieldDefinition<AnyZod>>

export interface TableDefinition<Fields extends FieldShape> {
  fields: Fields
  schema: z.ZodObject<{ [Key in keyof Fields]: Fields[Key]['schema'] }>
}

export type TableDefinitions = Record<string, TableDefinition<FieldShape>>
export type TableSchemaOf<Table extends TableDefinition<FieldShape>> = Table['schema']

// oxlint-disable no-unsafe-type-assertion -- Object.fromEntries loses the exact field keys that z.object preserves for callers.

export function tinybaseTable<const Fields extends FieldShape>(
  fields: Fields,
): TableDefinition<Fields> {
  // Reuse the provided zod cell schemas as the row schema source of truth.
  const shape = Object.fromEntries(
    Object.entries(fields).map(([cellId, definition]) => [cellId, definition.schema]),
  ) as { [Key in keyof Fields]: Fields[Key]['schema'] }

  return {
    fields,
    schema: z.object(shape),
  }
}
