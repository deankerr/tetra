import type { StoreApiFor, StoreRowsFor } from '@tetra/tinybase-schema'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { defineStoreDefinition } from '@tetra/tinybase-schema/runtime'
import { z } from 'zod'

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

export const catalogStoreDefinition = defineStoreDefinition({
  id: 'catalog',
  indexIds: [],
  schema: catalogStoreSchema,
})

export type CatalogRows = StoreRowsFor<typeof catalogStoreSchema>
export type CatalogTypedStore = StoreApiFor<typeof catalogStoreSchema>
