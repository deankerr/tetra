import { Accessors } from '#accessors'
import { Catalog } from '#catalog'
import { createTetraDb } from '#db'
import type { TetraDb } from '#db'
import { Prompts } from '#prompts'
import { Sessions } from '#sessions'
import { Transcripts } from '#transcripts'

export { Accessors } from '#accessors'
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
export { Execute } from '#execute'
export type { CredentialReader, ExecuteArgs, PreparedRun } from '#execute'
export { Prompts } from '#prompts'
export { Runner } from '#runner'
export type { RunnerEvents, RunnerInput } from '#runner'
export { Runs } from '#runs'
export type { RunArgs, RunHandle } from '#runs'
export { Sessions } from '#sessions'
export { resolveTools, toolIds, toolsRegistryMap } from '#tools'
export type { ToolDefinition } from '#tools'
export { Transcripts } from '#transcripts'
export type { MessagePatch } from '#transcripts'

export function createCoreModules(db: TetraDb = createTetraDb()) {
  const accessors = new Accessors(db)

  return {
    accessors,
    catalog: new Catalog(accessors),
    db,
    prompts: new Prompts(accessors),
    sessions: new Sessions(accessors),
    transcripts: new Transcripts(accessors),
  }
}
