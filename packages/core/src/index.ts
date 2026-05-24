import { Catalog } from '#catalog'
import { createTetraDb } from '#db'
import type { TetraDb } from '#db'
import { Helpers } from '#helpers'

export { Catalog } from '#catalog'
export type { MessageRole } from '#db'
export type { RequestStatus } from '#db'
export {
  RequestConfig,
  StepRecord,
  UsageSummary,
  bindTetraDb,
  createTetraIndexes,
  createTetraDb,
  createTetraStore,
  tetraDbDefinition,
} from '#db'
export type {
  DbSchemas,
  GenerationStatus,
  RequestConfig as RequestConfigType,
  Rows,
  TetraDb,
  TetraIndexes,
  TetraStore,
} from '#db'
export { Run, Runs } from '#runtime'
export { exportSession, loadSeeds } from '#seeds'
export { Helpers } from '#helpers'
export { toolIds, toolsRegistryMap } from '#tools'

export function createCoreModules(db: TetraDb = createTetraDb()) {
  const helpers = new Helpers(db)

  return {
    catalog: new Catalog(db),
    db,
    helpers,
  }
}
