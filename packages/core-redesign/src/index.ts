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
export { Prompts } from '#prompts'
export { Run, openRouterLanguageModelResolver } from '#run'
export type { CredentialReader, LanguageModelResolver, RunStart, RunStatus } from '#run'
export { Runs } from '#runs'
export type { RegenerateArgs, SendMessageArgs } from '#runs'
export { loadSeeds } from '#seeds'
export { Sessions } from '#sessions'
export type { SessionExport } from '#sessions'
export { parseStep } from '#steps'
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
