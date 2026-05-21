import { Catalog } from '#catalog'
import { createTetraDb } from '#db'
import type { TetraDb } from '#db'
import { Store } from '#store'

export { Catalog, createOpenRouterCatalogSource } from '#catalog'
export type { CatalogSource } from '#catalog'
export {
  DEFAULT_REQUEST_CONFIG,
  LanguageModelRecord,
  MessageRole,
  RequestConfig,
  RequestStatus,
  StepRecord,
  createTetraDb,
  createTetraMergeableDb,
} from '#db'
export type { DbSchemas, RequestConfig as RequestConfigType, Rows, TetraDb } from '#db'
export { createRequest, recoverInterrupted } from '#requests'
export { Run, openRouterLanguageModelResolver } from '#run'
export type { CredentialReader, LanguageModelResolver, RunStart, RunStatus } from '#run'
export { Runs } from '#runs'
export type { StartArgs } from '#runs'
export { exportSession, importSession, loadSeeds } from '#seeds'
export { Store } from '#store'
export type { MessagePatch } from '#store'
export { resolveTools, toolIds, toolsRegistryMap } from '#tools'
export type { ToolDefinition } from '#tools'

export function createCoreModules(db: TetraDb = createTetraDb()) {
  const store = new Store(db)

  return {
    catalog: new Catalog(db),
    db,
    store,
  }
}
