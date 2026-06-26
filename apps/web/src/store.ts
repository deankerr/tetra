import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { catalogStoreDefinition } from '@tetra/schemas/catalog'
import { libraryStoreDefinition } from '@tetra/schemas/library'
import { defineTypedStore } from '@tetra/tinybase-schema'
import { createStoreReactApi, createTinyBaseProviderProps } from '@tetra/tinybase-schema/react'
import {
  createMergeableStoreInstance,
  createStoreInstance,
  defineStoreDefinition,
} from '@tetra/tinybase-schema/runtime'
import {
  createLocalPersister,
  createSessionPersister,
} from 'tinybase/persisters/persister-browser/with-schemas'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import { z } from 'zod'

const CATALOG_DB_NAME = 'tetra:catalog'
const LIBRARY_BROADCAST_CHANNEL = 'tetra:library'
const LIBRARY_STORAGE_NAME = 'tetra:library'
const WEB_STORAGE_NAME = 'tetra:web'

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

const webStoreDefinition = defineStoreDefinition({
  id: 'web',
  indexIds: [],
  schema: webStoreSchema,
})

function createWebStoreInstances() {
  // The shared library is mergeable so local cache, tab sync, and remote sync speak one shape.
  return {
    catalog: createStoreInstance(catalogStoreDefinition),
    library: createMergeableStoreInstance(libraryStoreDefinition),
    web: createStoreInstance(webStoreDefinition),
  }
}

export type WebStoreInstances = ReturnType<typeof createWebStoreInstances>
export type WebStoreRuntime = Awaited<ReturnType<typeof createWebStoreRuntime>>
type LibraryRawStore = WebStoreInstances['library']['rawStore']

// Browser-only resources live for the whole page, so the runtime is a lazily-created singleton:
// one set of persisters, sockets, and channels shared across every mount (and StrictMode/HMR).
let webStoreRuntime: Promise<WebStoreRuntime> | undefined
export async function getWebStoreRuntime(): Promise<WebStoreRuntime> {
  return await (webStoreRuntime ??= createWebStoreRuntime())
}

// The web app is long-lived and auto-saving, so there is no teardown: persistence is continuous
// and the browser reclaims sockets and channels on unload. Startup loads each cache, then turns on
// auto-save and live sync. Core modules and provider props are derived here so React just wires them.
async function createWebStoreRuntime() {
  const stores = createWebStoreInstances()
  const catalogStore = stores.catalog.rawStore
  const libraryStore = stores.library.rawStore
  const webStore = stores.web.rawStore

  // Browser-local stores persist independently: catalog in IndexedDB, UI state in sessionStorage.
  const catalogPersister = createIndexedDbPersister(
    catalogStore,
    CATALOG_DB_NAME,
    undefined,
    reportIgnoredPersistenceError('catalog'),
  )
  const webPersister = createSessionPersister(
    webStore,
    WEB_STORAGE_NAME,
    reportIgnoredPersistenceError('web'),
  )
  const libraryPersister = createLocalPersister(
    libraryStore,
    LIBRARY_STORAGE_NAME,
    reportIgnoredPersistenceError('library'),
  )
  await catalogPersister.load(() => catalogStore.getContent())
  await webPersister.load(() => webStore.getContent())
  await libraryPersister.load(() => libraryStore.getContent())
  await catalogPersister.startAutoSave()
  await webPersister.startAutoSave()
  await libraryPersister.startAutoSave()

  // Live library sync: BroadcastChannel converges same-origin tabs, the optional Worker socket
  // fans out to other devices. Each owns its own swallowed-error logging.
  await startLibraryTabSync(libraryStore)
  await startLibraryRemoteSync(libraryStore)

  const core = createCoreModules({
    credentials: credentialStore,
    stores: {
      catalogStore: stores.catalog,
      libraryStore: stores.library,
    },
  })

  return {
    core,
    providerProps: createTinyBaseProviderProps(stores),
    stores,
  }
}

// Same-origin tab convergence over BroadcastChannel. A lone tab has no peer to answer TinyBase's
// startup probe, so that one swallowed error is expected noise rather than a real failure.
async function startLibraryTabSync(libraryStore: LibraryRawStore): Promise<void> {
  const synchronizer = createBroadcastChannelSynchronizer(
    libraryStore,
    LIBRARY_BROADCAST_CHANNEL,
    undefined,
    undefined,
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- TinyBase reports swallowed sync errors through this callback.
    (error: unknown) => {
      const isNoPeerProbe =
        typeof error === 'string' &&
        error.startsWith('No response from anyone to ') &&
        error.endsWith(', 1')
      if (isNoPeerProbe) {
        return
      }
      console.error('[stores:web] tab library sync error', error)
    },
  )
  await synchronizer.startSync()
}

// Remote sync is opt-in: it needs the VITE_SYNC_ENABLED switch on and a Worker URL configured.
async function startLibraryRemoteSync(libraryStore: LibraryRawStore): Promise<void> {
  if (getEnv('VITE_SYNC_ENABLED') !== 'true') {
    return
  }
  const workerUrl = getEnv('VITE_SYNC_WORKER_URL')
  if (workerUrl === undefined) {
    return
  }

  // Convert the Worker origin into the Durable Object websocket endpoint.
  const url = new URL('/sync', workerUrl)
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  console.log('sync enabled', url.toString())
  const synchronizer = await createWsSynchronizer(
    libraryStore,
    new WebSocket(url.toString()),
    undefined,
    undefined,
    undefined,
    (error: unknown) => {
      console.error('[stores:web] remote library sync error', error)
    },
  )
  await synchronizer.startSync()
}

function getEnv(name: string): string | undefined {
  const value = import.meta.env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

function reportIgnoredPersistenceError(label: string) {
  return (error: unknown) => {
    console.error(`[stores:web:${label}] persistence error`, error)
  }
}

export const catalogTinybase = createStoreReactApi(catalogStoreDefinition)
export const libraryTinybase = createStoreReactApi(libraryStoreDefinition)
export const webTinybase = createStoreReactApi(webStoreDefinition)
