import type { StoreRowsFor } from '@tetra/tinybase-schema'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { z } from 'zod'

import { defineTetraStore } from '../host/definition.ts'

export const catalogStoreSchema = defineTypedStore({
  tables: {
    languageModels: z.object({
      contextLength: z.number(),
      createdAt: z.number(),
      inputModalities: z.array(z.string()),
      name: z.string(),
      outputModalities: z.array(z.string()),
      provider: z.string(),
      providerName: z.string(),
      supportedParameters: z.array(z.string()),
      updatedAt: z.number(),
      upstreamCreatedAt: z.number(),
    }),
  },
  values: {
    lastRefreshed: z.number().nullable().default(null),
  },
})

export const catalogStoreDefinition = defineTetraStore({
  id: 'catalog',
  indexIds: [],
  policy: 'local-persisted',
  schema: catalogStoreSchema,
})

export type CatalogRows = StoreRowsFor<typeof catalogStoreSchema>
