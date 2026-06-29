import { defineSchema } from '@tetra/tinydb'
import type { DbFor, EntitiesFor } from '@tetra/tinydb'
import { z } from 'zod'

export const catalogSchema = defineSchema({
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

export type CatalogDb = DbFor<typeof catalogSchema>
export type CatalogEntities = EntitiesFor<typeof catalogSchema>
