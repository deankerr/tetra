import { tetraIndexIds, tetraStoreSchema } from '@tetra/store-schema'
import { defineTypedStore } from '@tetra/tinybase-schema'
import type { StoreSchemasFor } from '@tetra/tinybase-schema'
import { createStoreHooks } from '@tetra/tinybase-schema/react'
import type { Store as RawStore } from 'tinybase/store/with-schemas'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import { z } from 'zod'

export const TETRA_INDEXED_DB_NAME = 'tetra-local'
export const WEB_UI_STORE_ID = 'webUi'

// Tetra's main TinyBase store uses the persisted/synchronized application schema.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase's WithSchemas helper is exposed through a module cast.
export const tinybase = UiReact as unknown as UiReact.WithSchemas<
  StoreSchemasFor<typeof tetraStoreSchema>
>
export const typedTinybase = createStoreHooks(tetraStoreSchema, tetraIndexIds)

// Web UI state is tab-local runtime state, separate from Tetra's persisted/synchronized data.
export const webUiStoreSchema = defineTypedStore({
  tables: {
    sessionThreadViews: z.object({
      threadAnchorMessageId: z.string().nullable(),
    }),
  },
  values: {
    activeSessionId: z.string(),
    jsonView: z.object({
      json: z.string(),
      title: z.string(),
    }),
    settingsOpen: z.boolean(),
  },
})

export type WebUiRawStore = RawStore<StoreSchemasFor<typeof webUiStoreSchema>>

// TinyBase's Provider is schema-cast so the named UI store keeps its own store shape.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const webUiReact = UiReact as unknown as UiReact.WithSchemas<
  StoreSchemasFor<typeof webUiStoreSchema>
>

// Typed hooks target the named UI store by passing WEB_UI_STORE_ID at call sites.
export const webUiTinybase = createStoreHooks(webUiStoreSchema, [])

export async function clearTetraIndexedDbAndReload(): Promise<void> {
  if (globalThis.indexedDB === undefined) {
    globalThis.location.reload()
    return
  }

  // Promise.withResolvers bridges the IndexedDB request API.
  const { promise, reject, resolve } = Promise.withResolvers<undefined>()
  const request = indexedDB.deleteDatabase(TETRA_INDEXED_DB_NAME)

  request.addEventListener('error', () => {
    reject(new Error(`Failed to delete IndexedDB database: ${TETRA_INDEXED_DB_NAME}`))
  })

  request.addEventListener('blocked', () => {
    reject(new Error(`IndexedDB database is blocked by another open tab: ${TETRA_INDEXED_DB_NAME}`))
  })

  request.addEventListener('success', () => {
    resolve()
  })

  await promise
  globalThis.location.reload()
}
