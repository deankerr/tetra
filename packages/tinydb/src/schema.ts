import { toTinybaseTablesSchema, toTinybaseValuesSchema } from './emit.ts'
import type { TinybaseTablesSchemaOf, TinybaseValuesSchemaOf } from './emit.ts'
import type { IndexDefinitions, TableDefinitions, ValueDefinitions } from './types.ts'

// The schema carries everything createDb needs: zod definitions (source of truth for
// parsing and for inferred entity/query types) plus the emitted coarse TinyBase schemas.
export interface StoreSchema<
  Tables extends TableDefinitions,
  Values extends ValueDefinitions,
  Indexes extends IndexDefinitions<Tables>,
> {
  indexes: Indexes
  tables: Tables
  tablesSchema: TinybaseTablesSchemaOf<Tables>
  values: Values
  valuesSchema: TinybaseValuesSchemaOf<Values>
}

export type AnyStoreSchema = StoreSchema<
  TableDefinitions,
  ValueDefinitions,
  IndexDefinitions<TableDefinitions>
>

// oxlint-disable no-unsafe-type-assertion -- The emit boundary produces valid TinyBase schema objects from zod definitions.

export function defineSchema<
  const Tables extends TableDefinitions,
  const Values extends ValueDefinitions = Record<never, never>,
  const Indexes extends IndexDefinitions<Tables> = Record<never, never>,
>(def: {
  indexes?: Indexes
  tables: Tables
  values?: Values
}): StoreSchema<Tables, Values, Indexes> {
  const values = (def.values ?? {}) as Values
  const indexes = (def.indexes ?? {}) as Indexes

  return {
    indexes,
    tables: def.tables,
    tablesSchema: toTinybaseTablesSchema(def.tables) as TinybaseTablesSchemaOf<Tables>,
    values,
    valuesSchema: toTinybaseValuesSchema(values) as TinybaseValuesSchemaOf<Values>,
  }
}
