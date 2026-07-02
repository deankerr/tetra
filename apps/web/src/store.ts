import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { catalogSchema } from '@tetra/schemas/catalog'
import { librarySchema } from '@tetra/schemas/library'
import { defineSchema } from '@tetra/tinydb'
import { createDbReactApi } from '@tetra/tinydb/react'
import { createDb, createMergeableDb } from '@tetra/tinydb/runtime'
import {
  createOpfsPersister,
  createSessionPersister,
} from 'tinybase/persisters/persister-browser/with-schemas'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel/with-schemas'
import { z } from 'zod'

import { createWebSyncRuntime } from '@/sync'

const CATALOG_DB_NAME = 'tetra:catalog'
const LIBRARY_BROADCAST_CHANNEL = 'tetra:library'
const LIBRARY_OPFS_FILE_NAME = 'tetra-library.json'
const WEB_STORAGE_NAME = 'tetra:web'

const webSchema = defineSchema({
  tables: {
    sessionThreadViews: z.object({
      threadAnchorMessageId: z.string().nullable().default(null),
    }),
  },
  values: {
    apiKeySettingsOpen: z.boolean().default(false),
    jsonView: z
      .object({
        json: z.string(),
        title: z.string(),
      })
      .default({ json: '', title: '' }),
    syncSettingsOpen: z.boolean().default(false),
  },
})

// Stores are created eagerly (synchronous, in-memory) so the React APIs can bind to concrete
// instances at module load. Persistence and sync are layered on later by the async runtime.
// The shared library is mergeable so local cache, tab sync, and remote sync speak one shape.
const stores = {
  catalog: createDb(catalogSchema),
  library: createMergeableDb(librarySchema),
  web: createDb(webSchema),
}

export type WebStores = typeof stores
export type WebStoreRuntime = Awaited<ReturnType<typeof createWebStoreRuntime>>
type LibraryRawStore = WebStores['library']['raw']['store']
interface StorePersister {
  getStats(): { loads: number; saves: number }
}

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
  const catalogStore = stores.catalog.raw.store
  const libraryStore = stores.library.raw.store
  const webStore = stores.web.raw.store

  // Browser-local stores persist independently: catalog in IndexedDB, library in OPFS, UI state in sessionStorage.
  const libraryHandle = await getLibraryOpfsHandle()
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
  const libraryPersister = createOpfsPersister(
    libraryStore,
    libraryHandle,
    reportIgnoredPersistenceError('library'),
  )
  await catalogPersister.load(() => catalogStore.getContent())
  logPersisterLoaded('catalog', catalogPersister, {
    dbName: CATALOG_DB_NAME,
    storage: 'indexedDB',
  })
  await webPersister.load(() => webStore.getContent())
  logPersisterLoaded('web', webPersister, {
    storage: 'sessionStorage',
    storageName: WEB_STORAGE_NAME,
  })
  await libraryPersister.load(() => libraryStore.getContent())
  logPersisterLoaded('library', libraryPersister, {
    fileName: libraryHandle.name,
    storage: 'opfs',
  })
  await catalogPersister.startAutoSave()
  await webPersister.startAutoSave()
  await libraryPersister.startAutoSave()

  // Live library sync: BroadcastChannel converges same-origin tabs, the optional Worker socket
  // fans out to other devices. Each owns its own swallowed-error logging.
  await startLibraryTabSync(libraryStore)
  const sync = createWebSyncRuntime(libraryStore)

  const core = createCoreModules({
    credentials: credentialStore,
    stores: {
      catalog: stores.catalog,
      library: stores.library,
    },
  })

  return { core, stores, sync }
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

async function getLibraryOpfsHandle(): Promise<FileSystemFileHandle> {
  if (navigator.storage.getDirectory === undefined) {
    throw new Error('OPFS is not available: navigator.storage.getDirectory is missing')
  }

  // TinyBase's OPFS persister works with an existing file handle and owns whole-file JSON writes.
  const opfsDirectory = await navigator.storage.getDirectory()
  return await opfsDirectory.getFileHandle(LIBRARY_OPFS_FILE_NAME, { create: true })
}

function reportIgnoredPersistenceError(label: string) {
  return (error: unknown) => {
    console.error(`[stores:${label}] persistence error`, error)
  }
}

function logPersisterLoaded(
  label: string,
  persister: StorePersister,
  details: Record<string, string>,
): void {
  console.log(`[stores:${label}] persister loaded`, {
    ...details,
    stats: persister.getStats(),
  })
}

// Reactive read APIs bound to the eager store instances (no Provider/context).
export const catalogReact = createDbReactApi(catalogSchema, stores.catalog)
export const libraryReact = createDbReactApi(librarySchema, stores.library)
export const webReact = createDbReactApi(webSchema, stores.web)
