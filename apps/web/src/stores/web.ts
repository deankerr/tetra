import {
  catalogStoreDefinition,
  createStoreHost,
  defineTetraStore,
  libraryStoreDefinition,
} from '@tetra/stores'
import type { StoreApiFor } from '@tetra/tinybase-schema'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { z } from 'zod'

const webStoreSchema = defineTypedStore({
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
  schema: webStoreSchema,
})

const webStoreDefinitions = [
  libraryStoreDefinition,
  catalogStoreDefinition,
  webStoreDefinition,
] as const

export type WebStores = ReturnType<typeof createWebStores>
export type WebTypedStore = StoreApiFor<typeof webStoreSchema>

export function createWebStores() {
  // Web stores are currently volatile; persistence and sync are external concerns.
  return createStoreHost(webStoreDefinitions)
}
