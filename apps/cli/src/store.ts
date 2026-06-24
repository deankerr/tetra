import { catalogStoreDefinition } from '@tetra/stores/catalog'
import { libraryStoreDefinition } from '@tetra/stores/library'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { createStoreInstance, defineStoreDefinition } from '@tetra/tinybase-schema/runtime'
import { z } from 'zod'

const cliStoreSchema = defineTypedStore({
  tables: {},
  values: {
    activeSessionId: z.string().nullable().default(null),
  },
})

const cliStoreDefinition = defineStoreDefinition({
  id: 'cli',
  indexIds: [],
  schema: cliStoreSchema,
})

export type CliStoreInstances = ReturnType<typeof createCliStoreInstances>

export function createCliStoreInstances() {
  // CLI stores are currently volatile; persistence and sync are external concerns.
  return {
    catalog: createStoreInstance(catalogStoreDefinition),
    cli: createStoreInstance(cliStoreDefinition),
    library: createStoreInstance(libraryStoreDefinition),
  }
}
