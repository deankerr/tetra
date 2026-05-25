import type { BoundIndexes, BoundTinybase, TinybaseIndexes } from '@tetra/tinybase-schema'
import { bindTinybaseIndexes, bindTinybaseStore } from '@tetra/tinybase-schema'
import type { Store } from 'tinybase/store/with-schemas'

import { tetraDbDefinition } from '#db'

type TetraStore = Store<
  [typeof tetraDbDefinition.tinybaseTablesSchema, typeof tetraDbDefinition.tinybaseValuesSchema]
>
type TetraIndexes = TinybaseIndexes<
  [typeof tetraDbDefinition.tinybaseTablesSchema, typeof tetraDbDefinition.tinybaseValuesSchema]
>
type TetraStoreDb = BoundTinybase<
  typeof tetraDbDefinition.tables,
  typeof tetraDbDefinition.values
> & {
  store: TetraStore
}
type TetraIndexApis = BoundIndexes<typeof tetraDbDefinition.indexes>
export type TetraDb = TetraStoreDb & {
  indexes: TetraIndexApis
}

export function bindTetraDb(store: TetraStore, rawIndexes: TetraIndexes): TetraDb {
  // Bind zod-backed table and value helpers around an externally owned store.
  const bound = bindTinybaseStore(store, tetraDbDefinition.tables, tetraDbDefinition.values)

  // Bind typed index ids around an externally owned TinyBase Indexes object.
  const indexes = bindTinybaseIndexes(rawIndexes, tetraDbDefinition.indexes)

  // Return only the Tetra convenience API while keeping raw Store and Indexes separate.
  return {
    indexes,
    store,
    tables: bound.tables,
    values: bound.values,
  }
}
