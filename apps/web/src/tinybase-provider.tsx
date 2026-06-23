import {
  StoreHostProvider,
  useCreateRuntimePersister,
  useCreateRuntimeSynchronizer,
} from '@tetra/stores/react'
import {
  assertMergeableStore,
  createTinyBaseProviderProps,
  createWebIndexedDbPersister,
  createWebStoreHost,
  createWebWsSynchronizer,
  WEB_CATALOG_INDEXED_DB_NAME,
  WEB_LIBRARY_INDEXED_DB_NAME,
} from '@tetra/stores/web'
import type {
  RuntimePersister,
  RuntimeSynchronizer,
  WebDataMode,
  WebStoreHost,
} from '@tetra/stores/web'
import { createContext, useContext, useMemo } from 'react'

import { createSyncWebSocket } from '@/lib/websocket'

const DATA_MODE: WebDataMode = import.meta.env.VITE_TETRA_DATA_MODE === 'sync' ? 'sync' : 'persist'
const WebStoreHostContext = createContext<WebStoreHost | null>(null)

interface WebStoreLifecycle {
  persistersById: Record<string, RuntimePersister>
  synchronizersById: Record<string, RuntimeSynchronizer>
}

export function TinyBaseProvider({ children }: { children: React.ReactNode }) {
  // Browser stores are created synchronously; persistence and sync attach after render.
  const host = useMemo(() => createWebStoreHost(DATA_MODE), [])
  const providerProps = useMemo(() => createTinyBaseProviderProps(host), [host])
  const lifecycle = useWebStoreLifecycle(host, DATA_MODE)

  return (
    <WebStoreHostContext value={host}>
      <StoreHostProvider
        indexesById={providerProps.indexesById}
        persistersById={lifecycle.persistersById}
        storesById={providerProps.storesById}
        synchronizersById={lifecycle.synchronizersById}
      >
        {children}
      </StoreHostProvider>
    </WebStoreHostContext>
  )
}

export function useWebStoreHost(): WebStoreHost {
  const host = useContext(WebStoreHostContext)
  if (host === null) {
    throw new Error('useWebStoreHost must be used within TinyBaseProvider')
  }

  return host
}

function useWebStoreLifecycle(host: WebStoreHost, mode: WebDataMode): WebStoreLifecycle {
  const libraryPersister = useCreateRuntimePersister(
    host.library,
    async (instance): Promise<RuntimePersister | undefined> => {
      if (mode !== 'persist') {
        return undefined
      }

      // In persisted mode, the shared library store is durable but not synchronized.
      const persister = await createWebIndexedDbPersister(instance, WEB_LIBRARY_INDEXED_DB_NAME)
      await persister.startAutoLoad()
      await persister.startAutoSave()
      return persister
    },
    [mode],
  )
  const catalogPersister = useCreateRuntimePersister(host.catalog, async (instance) => {
    // Catalog is always a browser-local durable cache.
    const persister = await createWebIndexedDbPersister(instance, WEB_CATALOG_INDEXED_DB_NAME)
    await persister.startAutoLoad()
    await persister.startAutoSave()
    return persister
  })
  const librarySynchronizer = useCreateRuntimeSynchronizer(
    host.library,
    async (instance): Promise<RuntimeSynchronizer | undefined> => {
      if (mode !== 'sync') {
        return undefined
      }

      // Sync mode shares only the library store with the Worker.
      assertMergeableStore(instance)
      const synchronizer = await createWebWsSynchronizer(instance, createSyncWebSocket())
      await synchronizer.startSync()
      return synchronizer
    },
    [mode],
  )

  return {
    persistersById: compactLifecycleEntries([
      [host.catalog.definition.persisterId, catalogPersister],
      [host.library.definition.persisterId, libraryPersister],
    ]),
    synchronizersById: compactLifecycleEntries([
      [host.library.definition.synchronizerId, librarySynchronizer],
    ]),
  }
}

function compactLifecycleEntries<Item>(
  entries: readonly (readonly [string, Item | undefined])[],
): Record<string, Item> {
  const result: Record<string, Item> = {}
  for (const [id, item] of entries) {
    if (item !== undefined) {
      result[id] = item
    }
  }

  return result
}
