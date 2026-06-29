import type { DbFor, EntitiesFor, MergeableDbFor } from '@tetra/tinydb'

import { librarySchema } from './schema.ts'

// The library is the shared, mergeable (sync-capable) store. Modules consume the clean
// LibraryDb; the composition root creates a LibraryMergeableDb for persistence + sync.
export type LibraryDb = DbFor<typeof librarySchema>
export type LibraryMergeableDb = MergeableDbFor<typeof librarySchema>
export type LibraryEntities = EntitiesFor<typeof librarySchema>
export type LibraryRunStatus = LibraryEntities['runs']['status']

export {
  ProviderOptionsSchema,
  RunConfigSchema,
  RunConfigSnapshotSchema,
  SessionRunConfigSchema,
  StepWarningSchema,
} from './schema.ts'
export { librarySchema }
export type { RunConfig } from './schema.ts'
