import { catalogSchema } from '@tetra/schemas/catalog'
import { librarySchema } from '@tetra/schemas/library'
import { defineSchema } from '@tetra/tinydb'
import { createDbReactApi } from '@tetra/tinydb/react'
import { createDb, createMergeableDb } from '@tetra/tinydb/runtime'
import { z } from 'zod'

// The web app's store vocabulary, one line each:
//   library — your data: mergeable, durable, syncable across devices.
//   catalog — rebuildable cache of the OpenRouter model catalog.
//   desk    — what is spread out on this tab right now; cleared when you leave.
//   prefs   — durable device-level preferences, including sync consent.
//   sync    — ephemeral connection state written by the SyncController, read by React.

export const SettingsTabSchema = z.enum(['api-keys', 'sync', 'data'])
export type SettingsTab = z.infer<typeof SettingsTabSchema>

const deskSchema = defineSchema({
  tables: {
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
    // The settings dialog: null is closed, otherwise the active tab.
    settingsTab: SettingsTabSchema.nullable().default(null),
  },
})

const prefsSchema = defineSchema({
  tables: {},
  values: {
    syncEnabled: z.boolean().default(false),
    syncKey: z.string().nullable().default(null),
    syncWorkerUrl: z.string().nullable().default(null),
  },
})

const SyncConnectionStatusSchema = z.enum([
  'connecting',
  'disabled',
  'error',
  'live',
  'reconnecting',
  'unconfigured',
])
const SyncTransferStatusSchema = z.enum(['idle', 'loading', 'saving'])
export type SyncConnectionStatus = z.infer<typeof SyncConnectionStatusSchema>
export type SyncTransferStatus = z.infer<typeof SyncTransferStatusSchema>

// Deliberately unpersisted: a rehydrated "live" from a previous session would be a lie.
const syncSchema = defineSchema({
  tables: {},
  values: {
    lastError: z.string().nullable().default(null),
    receives: z.number().default(0),
    sends: z.number().default(0),
    status: SyncConnectionStatusSchema.default('disabled'),
    transfer: SyncTransferStatusSchema.default('idle'),
    url: z.string().nullable().default(null),
    workerUrl: z.string().nullable().default(null),
  },
})

// Stores are created eagerly (synchronous, in-memory) so the React APIs can bind to concrete
// instances at module load. Persistence and sync are layered on later by the async runtime.
// The shared library is mergeable so local cache, tab sync, and remote sync speak one shape.
export const stores = {
  catalog: createDb(catalogSchema),
  desk: createDb(deskSchema),
  library: createMergeableDb(librarySchema),
  prefs: createDb(prefsSchema),
  sync: createDb(syncSchema),
}

export type WebStores = typeof stores

// Reactive read APIs bound to the eager store instances (no Provider/context).
export const catalogReact = createDbReactApi(catalogSchema, stores.catalog)
export const deskReact = createDbReactApi(deskSchema, stores.desk)
export const libraryReact = createDbReactApi(librarySchema, stores.library)
export const prefsReact = createDbReactApi(prefsSchema, stores.prefs)
export const syncReact = createDbReactApi(syncSchema, stores.sync)
