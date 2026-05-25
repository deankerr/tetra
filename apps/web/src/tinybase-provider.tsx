import { tetraDbDefinition } from '@tetra/core'
import type { TinybaseSchemasFor } from '@tetra/tinybase-schema'
import { setTinybaseIndexDefinitions } from '@tetra/tinybase-schema'
import { useMemo } from 'react'
import ReconnectingWebSocket from 'reconnecting-websocket'
import type { Indexes as RawIndexes } from 'tinybase/indexes/with-schemas'
import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { MergeableStore as RawMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import type { Store as RawStore } from 'tinybase/store/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import { Inspector } from 'tinybase/ui-react-inspector'

import { TETRA_INDEXED_DB_NAME } from '@/lib/hard-reset'
import { tinybase } from '@/tetra-tinybase-react'

const DATA_MODE = import.meta.env.VITE_TETRA_DATA_MODE ?? 'persist'
const WORKER_URL = getSyncUrl(import.meta.env.VITE_WORKER_URL ?? 'ws://localhost:8787')

function getSyncUrl(workerUrl: string): string {
  // Convert the configured Worker origin into the Durable Object websocket URL.
  const url = new URL('/tetra', workerUrl)
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }
  return url.toString()
}

function useCreateTetraStore(): {
  rawIndexes: RawIndexes<TinybaseSchemasFor<typeof tetraDbDefinition>>
  rawStore: RawStore<TinybaseSchemasFor<typeof tetraDbDefinition>>
} {
  return useMemo(() => {
    // Plain web modes own Store and Indexes creation as one React-owned unit.
    const rawStore = createStore().setSchema(
      structuredClone(tetraDbDefinition.tinybaseTablesSchema),
      structuredClone(tetraDbDefinition.tinybaseValuesSchema),
    )
    const rawIndexes = createIndexes(rawStore)
    setTinybaseIndexDefinitions(rawIndexes, tetraDbDefinition.indexes)

    return { rawIndexes, rawStore }
  }, [])
}

function useCreateTetraMergeableStore(): {
  rawIndexes: RawIndexes<TinybaseSchemasFor<typeof tetraDbDefinition>>
  rawStore: RawMergeableStore<TinybaseSchemasFor<typeof tetraDbDefinition>>
} {
  return useMemo(() => {
    // Sync mode owns MergeableStore and Indexes creation as one React-owned unit.
    const rawStore = createMergeableStore().setSchema(
      structuredClone(tetraDbDefinition.tinybaseTablesSchema),
      structuredClone(tetraDbDefinition.tinybaseValuesSchema),
    )
    const rawIndexes = createIndexes(rawStore)
    setTinybaseIndexDefinitions(rawIndexes, tetraDbDefinition.indexes)

    return { rawIndexes, rawStore }
  }, [])
}

function TinyBasePersisterProvider({ children }: { children: React.ReactNode }) {
  // Plain web modes create their Store and Indexes synchronously.
  const { rawIndexes, rawStore } = useCreateTetraStore()

  // Local mode persists the plain Store to IndexedDB without blocking initial render.
  const persister = tinybase.useCreatePersister(
    rawStore,
    async (store) => {
      const indexedDbPersister = createIndexedDbPersister(store, TETRA_INDEXED_DB_NAME)
      await indexedDbPersister.startAutoLoad()
      await indexedDbPersister.startAutoSave()
      return indexedDbPersister
    },
    [],
  )

  return (
    <tinybase.Provider
      indexes={rawIndexes}
      store={rawStore}
      {...(persister === undefined ? {} : { persister })}
    >
      {children}
    </tinybase.Provider>
  )
}

function TinyBaseSyncProvider({ children }: { children: React.ReactNode }) {
  // Sync mode creates its MergeableStore and Indexes synchronously.
  const { rawIndexes, rawStore } = useCreateTetraMergeableStore()

  const synchronizer = tinybase.useCreateSynchronizer(
    rawStore,
    async (store) => {
      // TinyBase accepts WebSocket-compatible clients but its type only names native WebSocket.
      // oxlint-disable-next-line no-unsafe-type-assertion
      const webSocket = new ReconnectingWebSocket(WORKER_URL) as unknown as WebSocket
      const wsSynchronizer = await createWsSynchronizer(store, webSocket)
      await wsSynchronizer.startSync()
      return wsSynchronizer
    },
    [],
  )

  return (
    <tinybase.Provider
      indexes={rawIndexes}
      store={rawStore}
      {...(synchronizer === undefined ? {} : { synchronizer })}
    >
      {children}
      <Inspector />
    </tinybase.Provider>
  )
}

export function TinyBaseProvider({ children }: { children: React.ReactNode }) {
  if (DATA_MODE === 'sync') {
    return <TinyBaseSyncProvider>{children}</TinyBaseSyncProvider>
  }

  return <TinyBasePersisterProvider>{children}</TinyBasePersisterProvider>
}
