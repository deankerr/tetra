import { createCoreModules } from '@tetra/core'
import { createCredentialReader, credentialRegistry } from '@tetra/credentials'
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
const CREDENTIALS_STORAGE_NAME = 'tetra:credentials'
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
    new LocalStoragePersistence(
      'credentials',
      stores.credentials.raw.store,
      CREDENTIALS_STORAGE_NAME,
    ),
  ]
  for (const entry of persistence) {
    await entry.start()
  }

  // Dev-only: seed credentials and the sync key from VITE_* env vars so fresh browser
  // environments (agents, throwaway profiles) work without manual setup. Guarded by DEV so a
  // production build can never bake secrets into the bundle; stored values always win.
  if (import.meta.env.DEV) {
    seedDevValuesFromEnv()
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
    credentials: createCredentialReader((id) => stores.credentials.values[id].get()),
    stores: {
      catalog: stores.catalog,
      library: stores.library,
    },
  })

  // The model catalog is a rebuildable cache: refresh stale/empty data in the background, but
  // never block the app shell or overwrite a fresh cache on startup.
  void refreshModelCatalog(core.modelCatalog)

  console.log('[stores:runtime] runtime ready')
  return { core, stores, sync, wipeAllData }
}

async function refreshModelCatalog(
  modelCatalog: ReturnType<typeof createCoreModules>['modelCatalog'],
): Promise<void> {
  try {
    // ModelCatalog owns the stale check; this call should only fetch when the cache needs it.
    await modelCatalog.refresh()
  } catch (error) {
    console.error('[stores:catalog] auto-refresh failed', error)
  }
}

// Seed-if-empty: env vars fill blanks, they never overwrite what the user set in the UI.
function seedDevValuesFromEnv() {
  for (const { id } of credentialRegistry) {
    const envValue = getDevEnv(`VITE_${id}`)
    if (envValue !== undefined && stores.credentials.values[id].get().trim() === '') {
      stores.credentials.values[id].set(envValue)
      console.log(`[stores:credentials] seeded ${id} from VITE_${id}`)
    }
  }

  // A sync key in the env is a clear intent to sync, so consent is seeded along with it —
  // but only when the device had no key at all, so a UI "pause sync" survives reloads.
  const envSyncKey = getDevEnv('VITE_SYNC_KEY')
  if (envSyncKey !== undefined && stores.prefs.values.syncKey.get() === null) {
    stores.prefs.values.syncKey.set(envSyncKey)
    stores.prefs.values.syncEnabled.set(true)
    console.log('[stores:prefs] seeded sync key from VITE_SYNC_KEY')
  }
}

function getDevEnv(name: string): string | undefined {
  const rawValue: unknown = import.meta.env[name]
  const value = typeof rawValue === 'string' ? rawValue.trim() : ''
  return value === '' ? undefined : value
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
