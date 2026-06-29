import type { z } from 'zod'

import { parseEntity } from './collection.ts'
import type { EntityOf, IndexDecl, IndexesApi, RowZod, StoreApi } from './types.ts'

// Query methods are inferred from the table's index block: each index name becomes a
// method, its arg type is the `on` cell's output type, and it returns entities. A table
// with no declared indexes contributes no methods.
export type QueriesForTable<Table extends RowZod, TableIndexes> =
  TableIndexes extends Record<string, IndexDecl<Table>>
    ? {
        [Name in keyof TableIndexes]: (
          key: z.output<Table>[TableIndexes[Name]['on']],
        ) => EntityOf<Table>[]
      }
    : Record<never, never>

// oxlint-disable no-unsafe-type-assertion -- zod owns the boundary; the index returns coarse string ids.

export function buildQueries(
  store: StoreApi,
  indexes: IndexesApi,
  tableId: string,
  tableIndexes: Record<string, IndexDecl<RowZod>>,
  schema: RowZod,
): Record<string, (key: unknown) => unknown[]> {
  const queries: Record<string, (key: unknown) => unknown[]> = {}

  for (const name of Object.keys(tableIndexes)) {
    // TinyBase index ids are a single global namespace, but method names are table-scoped
    // (messages.bySession vs steps.bySession), so the registered id is namespaced by table.
    const indexId = `${tableId}/${name}`
    queries[name] = (key: unknown) =>
      indexes
        .getSliceRowIds(indexId, String(key))
        .map((rowId) => parseEntity(schema, rowId, store.getRow(tableId, rowId)))
  }

  return queries
}
