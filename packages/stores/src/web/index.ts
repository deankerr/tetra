import type { StoreApiFor, StoreRowsFor } from '@tetra/tinybase-schema'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { z } from 'zod'

import { defineTetraStore } from '../host/definition.ts'

export const webStoreSchema = defineTypedStore({
  tables: {
    draftSessions: z.object({
      sessionId: z.string(),
    }),
    sessionThreadViews: z.object({
      threadAnchorMessageId: z.string().nullable().default(null),
    }),
  },
  values: {
    jsonView: z
      .object({
        json: z.string(),
        title: z.string(),
      })
      .default({ json: '', title: '' }),
    settingsOpen: z.boolean().default(false),
  },
})

export const webStoreDefinition = defineTetraStore({
  id: 'web',
  indexIds: [],
  policy: 'tab-local',
  schema: webStoreSchema,
})

export type WebRows = StoreRowsFor<typeof webStoreSchema>
export type WebTypedStore = StoreApiFor<typeof webStoreSchema>
