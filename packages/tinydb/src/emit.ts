import type { TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

import type {
  AnyZod,
  FieldKind,
  TableDefinitions,
  TinyCellSchema,
  ValueDefinitions,
} from './types.ts'

export type TinybaseTablesSchemaOf<Tables extends TableDefinitions> = {
  [TableId in keyof Tables]: Record<keyof z.output<Tables[TableId]> & string, TinyCellSchema>
} & TablesSchema

export type TinybaseValuesSchemaOf<Values extends ValueDefinitions> = {
  [ValueId in keyof Values]: TinyCellSchema
} & ValuesSchema

export type TinybaseStoreSchemasOf<
  Tables extends TableDefinitions,
  Values extends ValueDefinitions,
> = [TinybaseTablesSchemaOf<Tables>, TinybaseValuesSchemaOf<Values>]

export function toTinybaseTablesSchema(tables: TableDefinitions): TablesSchema {
  // TinyBase only needs the coarse cell schema nested by table and cell id.
  const tablesSchema: Record<string, Record<string, TinyCellSchema>> = {}

  for (const [tableId, table] of Object.entries(tables)) {
    const tableSchema: Record<string, TinyCellSchema> = {}

    for (const [cellId, schema] of Object.entries(table.shape)) {
      tableSchema[cellId] = zodToTinybaseCellSchema(schema, `${tableId}.${cellId}`)
    }

    tablesSchema[tableId] = tableSchema
  }

  // TinyBase's runtime accepts allowNull/default:null, but with-schemas types lag behind.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The emitted runtime schema is valid TinyBase schema; only the with-schemas type omits nullable defaults.
  return tablesSchema as unknown as TablesSchema
}

export function toTinybaseValuesSchema(values: ValueDefinitions): ValuesSchema {
  // Values use the same coarse TinyBase cell schema shape without a row wrapper.
  const valuesSchema: Record<string, TinyCellSchema> = {}

  for (const [valueId, schema] of Object.entries(values)) {
    valuesSchema[valueId] = zodToTinybaseCellSchema(schema, valueId)
  }

  // TinyBase's runtime accepts allowNull/default:null, but with-schemas types lag behind.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The emitted runtime schema is valid TinyBase schema; only the with-schemas type omits nullable defaults.
  return valuesSchema as unknown as ValuesSchema
}

interface StandardJsonSchemaProps {
  jsonSchema: {
    input(options: {
      libraryOptions: { unrepresentable: 'any' }
      target: 'draft-2020-12'
    }): Record<string, unknown>
  }
}

interface JsonSchema {
  anyOf?: unknown
  default?: unknown
  type?: unknown
}

function zodToTinybaseCellSchema(schema: AnyZod, path: string): TinyCellSchema {
  // Convert through Standard JSON Schema so TinyBase's storage schema stays a coarse sibling of zod.
  const jsonSchema = getJsonSchema(schema, path)
  const { allowNull, schema: unwrapped } = unwrapNullable(jsonSchema)
  const type = getTinybaseType(unwrapped, path)
  assertCellIsNotOptional(schema, jsonSchema.default, path)
  return createTinybaseCellSchema(type, jsonSchema.default, allowNull, path)
}

function getJsonSchema(schema: AnyZod, path: string): JsonSchema {
  const standard = schema['~standard'] as StandardJsonSchemaProps | undefined
  if (standard === undefined) {
    throw new Error(`Missing Standard Schema metadata for ${path}`)
  }

  const jsonSchema = standard.jsonSchema.input({
    libraryOptions: { unrepresentable: 'any' },
    target: 'draft-2020-12',
  })
  if (!isJsonSchema(jsonSchema)) {
    throw new Error(`Invalid JSON Schema for ${path}`)
  }

  return jsonSchema
}

function unwrapNullable(schema: JsonSchema): { allowNull: boolean; schema: JsonSchema } {
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((type) => type !== 'null')
    if (types.length === 1 && types.length !== schema.type.length) {
      return { allowNull: true, schema: { ...schema, type: types[0] } }
    }
  }

  if (!Array.isArray(schema.anyOf)) {
    return { allowNull: false, schema }
  }

  const schemas = schema.anyOf.filter(isJsonSchema)
  const nonNullSchemas = schemas.filter((candidate) => candidate.type !== 'null')
  if (schemas.length === schema.anyOf.length && nonNullSchemas.length === 1) {
    const [nonNullSchema] = nonNullSchemas
    if (nonNullSchema === undefined) {
      throw new Error('Nullable schema has no non-null branch')
    }

    return { allowNull: true, schema: nonNullSchema }
  }

  return { allowNull: false, schema }
}

function getTinybaseType(schema: JsonSchema, path: string): FieldKind {
  if (schema.type === 'integer') {
    return 'number'
  }

  if (
    schema.type === 'array' ||
    schema.type === 'boolean' ||
    schema.type === 'number' ||
    schema.type === 'object' ||
    schema.type === 'string'
  ) {
    return schema.type
  }

  throw new Error(`Cannot convert ${path} to a TinyBase cell schema`)
}

function assertCellIsNotOptional(schema: AnyZod, defaultValue: unknown, path: string): void {
  // TinyBase cannot reliably clear optional cells through normal row/cell writes.
  // Use nullable cells and explicit nulls for absence; defaults are still valid cells.
  const missingCell: unknown = undefined
  if (defaultValue === undefined && schema.safeParse(missingCell).success) {
    throw new Error(`Optional TinyBase cells are not supported for ${path}; use nullable() instead`)
  }
}

function createTinybaseCellSchema(
  type: FieldKind,
  defaultValue: unknown,
  allowNull: boolean,
  path: string,
): TinyCellSchema {
  validateDefault(type, defaultValue, allowNull, path)
  return withOptionalNull(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validateDefault checks the default value against the selected TinyBase cell type above.
    { type, ...(defaultValue !== undefined && { default: defaultValue }) } as TinyCellSchema,
    allowNull,
  )
}

function withOptionalNull<Schema extends TinyCellSchema>(
  schema: Schema,
  allowNull: boolean,
): Schema {
  if (!allowNull) {
    return schema
  }

  return { ...schema, allowNull: true }
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null
}

function isTinybaseObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateDefault(
  type: FieldKind,
  defaultValue: unknown,
  allowNull: boolean,
  path: string,
): void {
  if (defaultValue === undefined) {
    return
  }
  if (defaultValue === null && allowNull) {
    return
  }
  if (type === 'array' && Array.isArray(defaultValue)) {
    return
  }
  if (type === 'object' && isTinybaseObject(defaultValue)) {
    return
  }
  if (
    (type === 'boolean' && typeof defaultValue === 'boolean') ||
    (type === 'number' && typeof defaultValue === 'number') ||
    (type === 'string' && typeof defaultValue === 'string')
  ) {
    return
  }

  throw new Error(`Invalid ${type} default for ${path}`)
}
