import { defineTypedStore } from '@tetra/tinybase-schema'
import type { StoreSchemasFor } from '@tetra/tinybase-schema'
import { createStoreHooks } from '@tetra/tinybase-schema/react'
import type { Store as RawStore } from 'tinybase/store/with-schemas'
import * as UiReact from 'tinybase/ui-react/with-schemas'
import { z } from 'zod'

export const WEB_UI_STORE_ID = 'webUi'

// Web UI state is tab-local runtime state, separate from Tetra's persisted/synchronized data.
export const webUiStoreSchema = defineTypedStore({
  tables: {},
  values: {
    activeSessionId: z.string(),
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
