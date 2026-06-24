import { catalogStoreDefinition } from './catalog/index.ts'
import { cliStoreDefinition } from './cli/index.ts'
import { createStoreHost } from './host/definition.ts'
import { libraryStoreDefinition } from './library/index.ts'

const cliStoreDefinitions = [
  libraryStoreDefinition,
  catalogStoreDefinition,
  cliStoreDefinition,
] as const

export type CliStores = ReturnType<typeof createCliStores>

export function createCliStores() {
  // CLI stores are currently volatile; persistence and sync are external concerns.
  return createStoreHost(cliStoreDefinitions)
}
