import type { Ids } from 'tinybase/common/with-schemas'

interface IndexesApi {
  getSliceIds(indexId: string): Ids
  getSliceRowIds(indexId: string, sliceId: string): Ids
}

export type IndexIds = readonly string[]

export interface IndexApi {
  getSliceIds(): Ids
  getSliceRowIds(sliceId: string): Ids
}

export type BoundIndexes<IndexIdList extends IndexIds> = {
  getIndex(indexId: IndexIdList[number]): IndexApi
  getSliceIds(indexId: IndexIdList[number]): Ids
  getSliceRowIds(indexId: IndexIdList[number], sliceId: string): Ids
} & Record<IndexIdList[number], IndexApi>

export function bindIndexes<const IndexIdList extends IndexIds>(
  indexes: IndexesApi,
  indexIds: IndexIdList,
): BoundIndexes<IndexIdList> {
  // Index APIs are intentionally row-id oriented like TinyBase's native Indexes API.
  const base = {
    getIndex(indexId: IndexIdList[number]): IndexApi {
      return {
        getSliceIds() {
          return indexes.getSliceIds(indexId)
        },

        getSliceRowIds(sliceId: string) {
          return indexes.getSliceRowIds(indexId, sliceId)
        },
      }
    },

    getSliceIds(indexId: IndexIdList[number]): Ids {
      return indexes.getSliceIds(indexId)
    },

    getSliceRowIds(indexId: IndexIdList[number], sliceId: string): Ids {
      return indexes.getSliceRowIds(indexId, sliceId)
    },
  }

  const accessors = Object.fromEntries(indexIds.map((indexId) => [indexId, base.getIndex(indexId)]))

  // oxlint-disable-next-line no-unsafe-type-assertion -- Object.assign preserves runtime accessors; the mapped type records their names.
  return Object.assign(base, accessors) as unknown as BoundIndexes<IndexIdList>
}
