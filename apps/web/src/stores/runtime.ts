import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel/with-schemas'

import { stores } from '@/stores'
import type { WebStores } from '@/stores'
import {
  IndexedDbPersistence,
  LocalStoragePersistence,
  OpfsFilePersistence,
  SessionStoragePersistence,
} from '@/stores/persistence'
import type { StorePersistence } from '@/stores/persistence'
import { SyncController } from '@/stores/sync/controller'
import { createDataWipe } from '@/stores/wipe'

const CATALOG_DB_NAME = 'tetra:catalog'
const DESK_STORAGE_NAME = 'tetra:desk'
const LIBRARY_BROADCAST_CHANNEL = 'tetra:library'
const LIBRARY_OPFS_FILE_NAME = 'tetra-library.json'
const PREFS_STORAGE_NAME = 'tetra:prefs'

export type WebRuntime = Awaited<ReturnType<typeof createWebRuntime>>

// Browser-only resources live for the whole page, so the runtime is a lazily-created singleton:
// one set of persisters, sockets, and channels shared across every mount (and StrictMode/HMR).
let webRuntime: Promise<WebRuntime> | undefined
export async function getWebRuntime(): Promise<WebRuntime> {
  return await (webRuntime ??= createWebRuntime())
}

// The web app is long-lived and auto-saving, so there is no teardown: persistence is continuous
// and the browser reclaims sockets and channels on unload. Startup gives every store its
// persistent home, then layers on live sync and the delete-all-data gesture.
async function createWebRuntime() {
  const persistence: StorePersistence[] = [
    new IndexedDbPersistence('catalog', stores.catalog.raw.store, CATALOG_DB_NAME),
    new OpfsFilePersistence('library', stores.library.raw.store, LIBRARY_OPFS_FILE_NAME),
    new SessionStoragePersistence('desk', stores.desk.raw.store, DESK_STORAGE_NAME),
    new LocalStoragePersistence('prefs', stores.prefs.raw.store, PREFS_STORAGE_NAME),
  ]
  for (const entry of persistence) {
    await entry.start()
  }

  // Live library sync: BroadcastChannel converges same-origin tabs, the optional Worker socket
  // fans out to other devices. The controller reads consent from prefs, so prefs loads first.
  const tabSync = await startLibraryTabSync(stores.library.raw.store)
  const sync = new SyncController({
    library: stores.library.raw.store,
    prefs: stores.prefs,
    status: stores.sync,
  })

  // Delete-all-data: everything that can write or receive gets halted, then the whole origin is
  // erased. The tab synchronizer counts — it must not keep feeding frames into a wiping tab.
  const wipeAllData = createDataWipe(async () => {
    console.log('[stores:runtime] halting sync, tab sync, and persistence')
    await sync.shutdown()
    await tabSync.destroy()
    for (const entry of persistence) {
      await entry.halt()
    }
  })

  const core = createCoreModules({
    credentials: credentialStore,
    stores: {
      catalog: stores.catalog,
      library: stores.library,
    },
  })

  console.log('[stores:runtime] runtime ready')
  return { core, stores, sync, wipeAllData }
}

// Same-origin tab convergence over BroadcastChannel. A lone tab has no peer to answer TinyBase's
// startup probe, so that one swallowed error is expected noise rather than a real failure.
async function startLibraryTabSync(libraryStore: WebStores['library']['raw']['store']) {
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
      console.error('[stores:library] tab sync error', error)
    },
  )
  await synchronizer.startSync()
  console.log('[stores:library] tab sync started', { channel: LIBRARY_BROADCAST_CHANNEL })
  return synchronizer
}
