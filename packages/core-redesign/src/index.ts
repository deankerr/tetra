import { Catalog } from '#catalog'
import { createTetraDb } from '#db'
import type { TetraDb } from '#db'
import { Store } from '#store'

export { Catalog } from '#catalog'
export type { MessageRole } from '#db'
export type { RequestStatus } from '#db'
export {
  DEFAULT_REQUEST_CONFIG,
  RequestConfig,
  StepRecord,
  createTetraDb,
  createTetraMergeableDb,
} from '#db'
export type { DbSchemas, RequestConfig as RequestConfigType, Rows, TetraDb } from '#db'
export { Run, Runs } from '#runtime'
export { exportSession, loadSeeds } from '#seeds'
export { Store } from '#store'
export { toolIds, toolsRegistryMap } from '#tools'

export function createCoreModules(db: TetraDb = createTetraDb()) {
  const store = new Store(db)

  return {
    catalog: new Catalog(db),
    db,
    store,
  }
}
