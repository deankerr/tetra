import { catalogStoreDefinition } from './catalog/index.ts'
import { createStoreHost } from './host/definition.ts'
import { libraryStoreDefinition } from './library/index.ts'
import { webStoreDefinition } from './web/index.ts'

export { catalogStoreDefinition, catalogStoreSchema } from './catalog/index.ts'
export type { CatalogRows, CatalogTypedStore } from './catalog/index.ts'
export { createTinyBaseProviderProps } from './host/definition.ts'
export {
  libraryIndexIds,
  libraryStoreDefinition,
  libraryStoreSchema,
  ProviderOptionsSchema,
  RunConfigSchema,
  RunConfigSnapshotSchema,
  SessionRunConfigSchema,
  StepWarningSchema,
} from './library/index.ts'
export type {
  LibraryRows,
  LibraryRunStatus,
  LibraryTypedIndexes,
  LibraryTypedStore,
  RunConfig,
} from './library/index.ts'
export { webStoreDefinition, webStoreSchema } from './web/index.ts'
export type { WebRows, WebTypedStore } from './web/index.ts'

const webStoreDefinitions = [
  libraryStoreDefinition,
  catalogStoreDefinition,
  webStoreDefinition,
] as const

export type WebStores = ReturnType<typeof createWebStores>

export function createWebStores() {
  // Web stores are currently volatile; persistence and sync are external concerns.
  return createStoreHost(webStoreDefinitions)
}
