import type { Ids, SortKey } from 'tinybase/common/with-schemas'
import type { Indexes as TinyIndexes } from 'tinybase/indexes/with-schemas'
import type { TablesSchema, ValuesSchema } from 'tinybase/store/with-schemas'
import type { z } from 'zod'

import type { TableDefinitions, TableSchemaOf } from './table.ts'

export type TinybaseIndexes<
  Schemas extends [TablesSchema, ValuesSchema] = [TablesSchema, ValuesSchema],
> = TinyIndexes<Schemas>

export type IndexCellId<
  Tables extends TableDefinitions,
  TableId extends keyof Tables & string,
> = keyof z.output<TableSchemaOf<Tables[TableId]>> & string

export interface IndexDefinition<
  Tables extends TableDefinitions,
  TableId extends keyof Tables & string,
> {
  rowIdSorter?: (sortKey1: SortKey, sortKey2: SortKey, sliceId: string) => number
  sliceBy?: IndexCellId<Tables, TableId>
  sliceIdSorter?: (sliceId1: string, sliceId2: string) => number
  sortBy?: IndexCellId<Tables, TableId>
  tableId: TableId
}

export type IndexDefinitions<Tables extends TableDefinitions> = Record<
  string,
  IndexDefinition<Tables, keyof Tables & string>
>

export interface IndexApi {
  getSliceIds(): Ids
  getSliceRowIds(sliceId: string): Ids
}

export type BoundIndexes<IndexDefs extends Record<string, unknown>> = {
  getIndex(indexId: keyof IndexDefs & string): IndexApi
  getSliceIds(indexId: keyof IndexDefs & string): Ids
  getSliceRowIds(indexId: keyof IndexDefs & string, sliceId: string): Ids
} & {
  [IndexId in keyof IndexDefs]: IndexApi
}

export function tinybaseIndex<const TableId extends string>(
  tableId: TableId,
  sliceBy?: string,
  options: {
    rowIdSorter?: (sortKey1: unknown, sortKey2: unknown, sliceId: string) => number
    sliceIdSorter?: (sliceId1: string, sliceId2: string) => number
    sortBy?: string
  } = {},
): IndexDefinition<TableDefinitions, TableId> {
  return {
    ...options,
    ...(sliceBy !== undefined && { sliceBy }),
    tableId,
  }
}

export function bindTinybaseIndexes<
  Schemas extends [TablesSchema, ValuesSchema],
  IndexDefs extends Record<string, unknown>,
>(indexes: TinybaseIndexes<Schemas>, definitions: IndexDefs): BoundIndexes<IndexDefs> {
  // Index APIs are intentionally row-id oriented like TinyBase's native Indexes API.
  const base = {
    getIndex(indexId: keyof IndexDefs & string): IndexApi {
      return {
        getSliceIds() {
          return indexes.getSliceIds(indexId)
        },

        getSliceRowIds(sliceId: string) {
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
  }

  const accessors = Object.fromEntries(
    (Object.keys(definitions) as (keyof IndexDefs & string)[]).map((indexId) => [
      indexId,
      base.getIndex(indexId),
    ]),
  )

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.assign preserves runtime accessors; the mapped type records their names.
  return Object.assign(base, accessors) as unknown as BoundIndexes<IndexDefs>
}

export function setTinybaseIndexDefinitions<Schemas extends [TablesSchema, ValuesSchema]>(
  indexes: TinybaseIndexes<Schemas>,
  definitions: IndexDefinitions<TableDefinitions>,
): void {
  // Apply declared index definitions onto an externally owned TinyBase Indexes object.
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
}
