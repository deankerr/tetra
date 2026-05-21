import { z } from 'zod'

import type { FieldShape, TableDefinition } from './types.ts'

// oxlint-disable no-unsafe-type-assertion -- Object.fromEntries loses the exact field keys that z.object preserves for callers.

export function tinybaseTable<const Fields extends FieldShape>(
  fields: Fields,
): TableDefinition<Fields> {
  const shape = Object.fromEntries(
    Object.entries(fields).map(([cellId, definition]) => [cellId, definition.schema]),
  ) as { [Key in keyof Fields]: Fields[Key]['schema'] }

  return {
    fields,
    schema: z.object(shape),
  }
}
