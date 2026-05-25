import { Catalog, Helpers, Runs, tetraDbDefinition } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import type { TinybaseSchemasFor } from '@tetra/tinybase-schema'
import {
  bindTinybaseIndexes,
  bindTinybaseStore,
  setTinybaseIndexDefinitions,
} from '@tetra/tinybase-schema'
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
import { TetraContext } from '@/tetra-context'
import { tinybase } from '@/tetra-tinybase-react'

const DATA_MODE = import.meta.env.VITE_TETRA_DATA_MODE ?? 'memory'
const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'ws://localhost:8787'

function getDataMode() {
  if (DATA_MODE === 'memory' || DATA_MODE === 'local' || DATA_MODE === 'sync') {
    return DATA_MODE
  }

  throw new Error(`Unknown VITE_TETRA_DATA_MODE: ${DATA_MODE}`)
}

function getSyncUrl(workerUrl: string): string {
  const url = new URL('/tetra', workerUrl)
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }
  return url.toString()
}

function createTetraApp(
  rawStore: RawStore<TinybaseSchemasFor<typeof tetraDbDefinition>>,
  rawIndexes: RawIndexes<TinybaseSchemasFor<typeof tetraDbDefinition>>,
) {
  const typedStore = bindTinybaseStore(rawStore, tetraDbDefinition.tables, tetraDbDefinition.values)
  const typedIndexes = bindTinybaseIndexes(rawIndexes, tetraDbDefinition.indexes)
  const context = { rawIndexes, rawStore, typedIndexes, typedStore }

  const helpers = new Helpers(context)
  const catalog = new Catalog(context)
  const runs = new Runs(helpers, credentialStore)

  return { catalog, helpers, runs }
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

export function TetraProvider({ children }: { children: React.ReactNode }) {
  const dataMode = getDataMode()

  if (dataMode === 'sync') {
    return <TetraSyncProvider>{children}</TetraSyncProvider>
  }

  return <TetraPlainProvider persister={dataMode === 'local'}>{children}</TetraPlainProvider>
}

function TetraPlainProvider({
  children,
  persister: shouldCreatePersister,
}: {
  children: React.ReactNode
  persister: boolean
}) {
  // Plain web modes create their Store and Indexes synchronously before binding core modules.
  const { rawIndexes, rawStore } = useCreateTetraStore()

  // Bind Tetra's typed APIs and core modules around the React-owned Store.
  const tetra = useMemo(() => createTetraApp(rawStore, rawIndexes), [rawIndexes, rawStore])

  // Local mode persists the plain Store to IndexedDB without blocking initial render.
  const persister = tinybase.useCreatePersister(
    shouldCreatePersister ? rawStore : undefined,
    async (store) => {
      const indexedDbPersister = createIndexedDbPersister(store, TETRA_INDEXED_DB_NAME)
      await indexedDbPersister.startAutoLoad()
      await indexedDbPersister.startAutoSave()
      return indexedDbPersister
    },
    [shouldCreatePersister],
  )

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        helpers: tetra.helpers,
        runs: tetra.runs,
      }}
    >
      <tinybase.Provider
        indexes={rawIndexes}
        store={rawStore}
        {...(persister === undefined ? {} : { persister })}
      >
        {children}
      </tinybase.Provider>
    </TetraContext>
  )
}

function TetraSyncProvider({ children }: { children: React.ReactNode }) {
  // Sync mode creates its MergeableStore and Indexes synchronously before binding core modules.
  const { rawIndexes, rawStore } = useCreateTetraMergeableStore()

  // Bind Tetra's typed APIs and core modules around the React-owned Store.
  const tetra = useMemo(() => createTetraApp(rawStore, rawIndexes), [rawIndexes, rawStore])

  const synchronizer = tinybase.useCreateSynchronizer(
    rawStore,
    async (store) => {
      // TinyBase accepts WebSocket-compatible clients but its type only names native WebSocket.
      // oxlint-disable-next-line no-unsafe-type-assertion
      const webSocket = new ReconnectingWebSocket(getSyncUrl(WORKER_URL)) as unknown as WebSocket
      const wsSynchronizer = await createWsSynchronizer(store, webSocket)
      await wsSynchronizer.startSync()
      return wsSynchronizer
    },
    [],
  )

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        helpers: tetra.helpers,
        runs: tetra.runs,
      }}
    >
      <tinybase.Provider
        indexes={rawIndexes}
        store={rawStore}
        {...(synchronizer === undefined ? {} : { synchronizer })}
      >
        {children}
        <Inspector />
      </tinybase.Provider>
    </TetraContext>
  )
}
