import { defineTypedStore } from '@tetra/tinybase-schema'
import { z } from 'zod'

import { defineTetraStore } from '../host/definition.ts'

export const cliStoreSchema = defineTypedStore({
  tables: {},
  values: {
    activeSessionId: z.string().nullable().default(null),
  },
})

export const cliStoreDefinition = defineTetraStore({
  id: 'cli',
  indexIds: [],
  policy: 'local-persisted',
  schema: cliStoreSchema,
})
