import type { z } from 'zod'

import type { AnyZod, FieldDefinition, FieldKind, FieldOptions, TinyCellSchema } from './types.ts'

type TinySchemaOf<
  Kind extends FieldKind,
  Schema extends AnyZod,
  Options extends FieldOptions<z.output<Schema>> | undefined,
> = TinyCellSchema & { type: Kind } & (Options extends { default: infer Default }
    ? { default: Default }
    : unknown)

function fieldOf<
  Schema extends AnyZod,
  const Kind extends FieldKind,
  const Options extends FieldOptions<z.output<Schema>> | undefined,
>(
  schema: Schema,
  type: Kind,
  options?: Options,
): FieldDefinition<Schema, TinySchemaOf<Kind, Schema, Options>> {
  const tinySchema: TinyCellSchema = { type }

  if (options?.default !== undefined) {
    tinySchema.default = options.default
  }

  if (options?.allowNull === true) {
    tinySchema.allowNull = true
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The public constructor pins the TinyBase cell kind while the schema owns the precise default type.
  return { schema, tinySchema: tinySchema as TinySchemaOf<Kind, Schema, Options> }
}

export const tinybaseCell = {
  array<Schema extends AnyZod, const Options extends FieldOptions<z.output<Schema>> | undefined>(
    schema: Schema,
    options?: Options,
  ) {
    return fieldOf(schema, 'array', options)
  },

  boolean<Schema extends AnyZod, const Options extends FieldOptions<z.output<Schema>> | undefined>(
    schema: Schema,
    options?: Options,
  ) {
    return fieldOf(schema, 'boolean', options)
  },

  number<Schema extends AnyZod, const Options extends FieldOptions<z.output<Schema>> | undefined>(
    schema: Schema,
    options?: Options,
  ) {
    return fieldOf(schema, 'number', options)
  },

  object<Schema extends AnyZod, const Options extends FieldOptions<z.output<Schema>> | undefined>(
    schema: Schema,
    options?: Options,
  ) {
    return fieldOf(schema, 'object', options)
  },

  string<Schema extends AnyZod, const Options extends FieldOptions<z.output<Schema>> | undefined>(
    schema: Schema,
    options?: Options,
  ) {
    return fieldOf(schema, 'string', options)
  },
}
