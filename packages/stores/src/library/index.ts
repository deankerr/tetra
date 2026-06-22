import type { StoreRowsFor } from '@tetra/tinybase-schema'

import { defineTetraStore } from '../host/definition.ts'
import { applyLibraryIndexes, libraryIndexIds } from './indexes.ts'
import { libraryStoreSchema } from './schema.ts'

export const libraryStoreDefinition = defineTetraStore({
  applyIndexes: applyLibraryIndexes,
  id: 'library',
  indexIds: libraryIndexIds,
  policy: 'synced',
  schema: libraryStoreSchema,
})

export type LibraryRows = StoreRowsFor<typeof libraryStoreSchema>
export { libraryIndexIds, libraryStoreSchema }
