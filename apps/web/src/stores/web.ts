import { catalogStoreDefinition } from '@tetra/stores/catalog'
import { libraryStoreDefinition } from '@tetra/stores/library'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { createStoreInstance, defineStoreDefinition } from '@tetra/tinybase-schema/runtime'
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

export const webStoreDefinition = defineStoreDefinition({
  id: 'web',
  indexIds: [],
  schema: webStoreSchema,
})

export type WebStoreInstances = ReturnType<typeof createWebStoreInstances>

export function createWebStoreInstances() {
  // Web stores are currently volatile; persistence and sync are external concerns.
  return {
    catalog: createStoreInstance(catalogStoreDefinition),
    library: createStoreInstance(libraryStoreDefinition),
    web: createStoreInstance(webStoreDefinition),
  }
}
