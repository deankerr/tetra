import {
  catalogStoreDefinition,
  createStoreHost,
  defineTetraStore,
  libraryStoreDefinition,
} from '@tetra/stores'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { z } from 'zod'

const cliStoreSchema = defineTypedStore({
  tables: {},
  values: {
    activeSessionId: z.string().nullable().default(null),
  },
})

const cliStoreDefinition = defineTetraStore({
  id: 'cli',
  indexIds: [],
  schema: cliStoreSchema,
})

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
