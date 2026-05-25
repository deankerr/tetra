import type { TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

import type { ValueDefinitions } from './store.ts'
import type { TableDefinitions, TableSchemaOf } from './table.ts'
import type { AnyZod, FieldKind, TinyCellSchema } from './types.ts'

export type NativeTablesSchemaOf<Tables extends TableDefinitions> = {
  [TableId in keyof Tables]: Record<
    keyof z.output<TableSchemaOf<Tables[TableId]>> & string,
    TinyCellSchema
  >
} & TablesSchema

export type NativeValuesSchemaOf<Values extends ValueDefinitions> = {
  [ValueId in keyof Values]: TinyCellSchema
} & ValuesSchema

export type NativeStoreSchemasOf<
  Tables extends TableDefinitions,
  Values extends ValueDefinitions,
> = [NativeTablesSchemaOf<Tables>, NativeValuesSchemaOf<Values>]

export function toTinybaseTablesSchema(tables: TableDefinitions): TablesSchema {
  // TinyBase only needs the coarse cell schema nested by table and cell id.
  const tablesSchema: TablesSchema = {}

  for (const [tableId, table] of Object.entries(tables)) {
    const tableSchema: TablesSchema[string] = {}

    for (const [cellId, schema] of Object.entries(table.shape)) {
      tableSchema[cellId] = zodToTinybaseCellSchema(schema, `${tableId}.${cellId}`)
    }

    tablesSchema[tableId] = tableSchema
  }

  return tablesSchema
}

export function toTinybaseValuesSchema(values: ValueDefinitions): ValuesSchema {
  // Values use the same coarse TinyBase cell schema shape without a row wrapper.
  const valuesSchema: ValuesSchema = {}

  for (const [valueId, schema] of Object.entries(values)) {
    valuesSchema[valueId] = zodToTinybaseCellSchema(schema, valueId)
  }

  return valuesSchema
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
    return { allowNull: true, schema: nonNullSchemas[0] }
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

function createTinybaseCellSchema(
  type: FieldKind,
  defaultValue: unknown,
  allowNull: boolean,
  path: string,
): TinyCellSchema {
  if (type === 'array') {
    if (defaultValue !== undefined && !Array.isArray(defaultValue)) {
      throw new Error(`Invalid array default for ${path}`)
    }
    return withOptionalNull(
      { type, ...(defaultValue !== undefined && { default: defaultValue }) },
      allowNull,
    )
  }

  if (type === 'boolean') {
    if (defaultValue !== undefined && typeof defaultValue !== 'boolean') {
      throw new Error(`Invalid boolean default for ${path}`)
    }
    return withOptionalNull(
      { type, ...(defaultValue !== undefined && { default: defaultValue }) },
      allowNull,
    )
  }

  if (type === 'number') {
    if (defaultValue !== undefined && typeof defaultValue !== 'number') {
      throw new Error(`Invalid number default for ${path}`)
    }
    return withOptionalNull(
      { type, ...(defaultValue !== undefined && { default: defaultValue }) },
      allowNull,
    )
  }

  if (type === 'object') {
    if (defaultValue !== undefined && !isTinybaseObject(defaultValue)) {
      throw new Error(`Invalid object default for ${path}`)
    }
    return withOptionalNull(
      { type, ...(defaultValue !== undefined && { default: defaultValue }) },
      allowNull,
    )
  }

  if (defaultValue !== undefined && typeof defaultValue !== 'string') {
    throw new Error(`Invalid string default for ${path}`)
  }
  return withOptionalNull(
    { type, ...(defaultValue !== undefined && { default: defaultValue }) },
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
