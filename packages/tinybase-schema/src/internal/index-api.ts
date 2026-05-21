import type { Ids } from 'tinybase/common/with-schemas'
import { createIndexes as createTinybaseIndexes } from 'tinybase/indexes/with-schemas'
import type { TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'

import type {
  BoundIndexes,
  IndexApi,
  IndexDefinitions,
  TableDefinitions,
  TinybaseIndexes,
  TinybaseStore,
} from '../public/types.ts'

export function createIndexesApi<
  Schemas extends [TablesSchema, ValuesSchema],
  IndexDefs extends Record<string, unknown>,
>(indexes: TinybaseIndexes<Schemas>, definitions: IndexDefs): BoundIndexes<IndexDefs> {
  const base = {
    getIndex(indexId: keyof IndexDefs & string): IndexApi {
      return {
        getSliceIds(): Ids {
          return indexes.getSliceIds(indexId)
        },
        getSliceRowIds(sliceId: string): Ids {
          return indexes.getSliceRowIds(indexId, sliceId)
        },
      }
    },
    getSliceIds(indexId: keyof IndexDefs & string): Ids {
      return indexes.getSliceIds(indexId)
    },
    getSliceRowIds(indexId: keyof IndexDefs & string, sliceId: string): Ids {
      return indexes.getSliceRowIds(indexId, sliceId)
    },
    raw: indexes,
  }

  const accessors = Object.fromEntries(
    (Object.keys(definitions) as (keyof IndexDefs & string)[]).map((indexId) => [
      indexId,
      base.getIndex(indexId),
    ]),
  )

  // oxlint-disable-next-line no-unsafe-type-assertion -- Object.assign adds index-id accessors that TypeScript cannot represent without a boundary assertion.
  return Object.assign(base, accessors) as unknown as BoundIndexes<IndexDefs>
}

export function createIndexesFromDefinitions<Schemas extends [TablesSchema, ValuesSchema]>(
  store: TinybaseStore<Schemas>,
  definitions: IndexDefinitions<TableDefinitions>,
): TinybaseIndexes<Schemas> {
  const indexes = createTinybaseIndexes(store)

  for (const [indexId, definition] of Object.entries(definitions)) {
    indexes.setIndexDefinition(
      indexId,
      definition.tableId,
      definition.sliceBy,
      definition.sortBy,
      definition.sliceIdSorter,
      definition.rowIdSorter,
    )
  }

  return indexes
}
