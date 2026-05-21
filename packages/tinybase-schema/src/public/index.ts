import type { IndexDefinition, TableDefinitions } from './types.ts'

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
