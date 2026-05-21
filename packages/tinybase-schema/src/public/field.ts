import type { z } from 'zod'

import type { AnyZod, FieldDefinition, FieldKind, FieldOptions, TinyCellSchema } from './types.ts'

function fieldOf<Schema extends AnyZod, Default>(
  schema: Schema,
  type: FieldKind,
  options: FieldOptions<Default> = {},
): FieldDefinition<Schema> {
  const tinySchema: TinyCellSchema = { type }

  if (options.default !== undefined) {
    tinySchema.default = options.default
  }

  if (options.allowNull === true) {
    tinySchema.allowNull = true
  }

  return { schema, tinySchema }
}

export const tinybaseCell = {
  array<Schema extends AnyZod>(schema: Schema, options?: FieldOptions<z.output<Schema>>) {
    return fieldOf(schema, 'array', options)
  },

  boolean<Schema extends AnyZod>(schema: Schema, options?: FieldOptions<z.output<Schema>>) {
    return fieldOf(schema, 'boolean', options)
  },

  number<Schema extends AnyZod>(schema: Schema, options?: FieldOptions<z.output<Schema>>) {
    return fieldOf(schema, 'number', options)
  },

  object<Schema extends AnyZod>(schema: Schema, options?: FieldOptions<z.output<Schema>>) {
    return fieldOf(schema, 'object', options)
  },

  string<Schema extends AnyZod>(schema: Schema, options?: FieldOptions<z.output<Schema>>) {
    return fieldOf(schema, 'string', options)
  },
}
