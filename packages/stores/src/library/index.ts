import type { BoundIndexes, StoreApiFor, StoreRowsFor } from '@tetra/tinybase-schema'
import { defineStoreDefinition } from '@tetra/tinybase-schema/runtime'

import { applyLibraryIndexes, libraryIndexIds } from './indexes.ts'
import { libraryStoreSchema } from './schema.ts'

export const libraryStoreDefinition = defineStoreDefinition({
  applyIndexes: applyLibraryIndexes,
  id: 'library',
  indexIds: libraryIndexIds,
  schema: libraryStoreSchema,
})

export type LibraryRows = StoreRowsFor<typeof libraryStoreSchema>
export type LibraryRunStatus = LibraryRows['runs']['status']
export type LibraryTypedIndexes = BoundIndexes<typeof libraryIndexIds>
export type LibraryTypedStore = StoreApiFor<typeof libraryStoreSchema>
export {
  ProviderOptionsSchema,
  RunConfigSchema,
  RunConfigSnapshotSchema,
  SessionRunConfigSchema,
  StepWarningSchema,
} from './schema.ts'
export { libraryIndexIds, libraryStoreSchema }
export type { RunConfig } from './schema.ts'
