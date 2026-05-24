import type { Catalog, Helpers, TetraDb } from '@tetra/core'
import {
  Runs,
  bindTetraDb,
  createCoreModules,
  createTetraIndexes,
  createTetraStore,
} from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { useMemo } from 'react'
import ReconnectingWebSocket from 'reconnecting-websocket'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import type { MergeableStore as TinyMergeableStore } from 'tinybase/mergeable-store'
import type { Persister as TinyPersister } from 'tinybase/persisters'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'
import { Provider, useCreateSynchronizer } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { TetraContext } from '@/tetra-context'
import type { DataMode } from '@/tetra-context'
import { tinybase } from '@/tinybase'

const DATA_MODE = import.meta.env.VITE_TETRA_DATA_MODE ?? 'memory'
const INDEXED_DB_NAME = 'tetra-local'
const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'ws://localhost:8787'

interface TetraApp {
  catalog: Catalog
  db: TetraDb
  helpers: Helpers
  runs: Runs
}

function getDataMode(): DataMode {
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

export function TetraProvider({ children }: { children: React.ReactNode }) {
  const dataMode = getDataMode()

  // The web app owns Store creation through TinyBase's React hook.
  const rawStore = tinybase.useCreateStore(() =>
    createTetraStore({ mergeable: dataMode === 'sync' }),
  )

  // Keep indexes synchronous for now so core modules are available on the first render.
  const rawIndexes = useMemo(() => createTetraIndexes(rawStore), [rawStore])

  // Bind Tetra's typed APIs and core modules around the React-owned Store.
  const tetra = useMemo<TetraApp>(() => {
    const db = bindTetraDb(rawStore, rawIndexes)
    const core = createCoreModules(db)
    const runs = new Runs(core.helpers, credentialStore)
    return { catalog: core.catalog, db, helpers: core.helpers, runs }
  }, [rawIndexes, rawStore])

  // Local mode persists the plain Store to IndexedDB without blocking initial render.
  const persister = tinybase.useCreatePersister(
    dataMode === 'local' ? rawStore : undefined,
    async (store) => {
      const indexedDbPersister = createIndexedDbPersister(store, INDEXED_DB_NAME)
      await indexedDbPersister.startAutoLoad()
      await indexedDbPersister.startAutoSave()
      return indexedDbPersister
    },
    [dataMode],
  )

  // The Store is known to be mergeable only in sync mode.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const syncStore = dataMode === 'sync' ? (rawStore as unknown as TinyMergeableStore) : undefined

  // Sync mode uses a MergeableStore connected directly to the shared Durable Object.
  const synchronizer = useCreateSynchronizer(
    syncStore,
    async (store) => {
      // TinyBase accepts WebSocket-compatible clients but its type only names native WebSocket.
      // oxlint-disable-next-line no-unsafe-type-assertion
      const webSocket = new ReconnectingWebSocket(getSyncUrl(WORKER_URL)) as unknown as WebSocket
      const wsSynchronizer = await createWsSynchronizer(store, webSocket)
      await wsSynchronizer.startSync()
      return wsSynchronizer
    },
    [dataMode],
  )

  // TinyBase requires untyped store/indexes/persister for the Provider component.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeStore = tetra.db.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeIndexes = tetra.db.indexes.raw as unknown as TinyIndexes
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimePersister = persister as unknown as TinyPersister | undefined

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        dataMode,
        helpers: tetra.helpers,
        runs: tetra.runs,
      }}
    >
      <Provider
        indexes={runtimeIndexes}
        store={runtimeStore}
        {...(runtimePersister === undefined ? {} : { persister: runtimePersister })}
        {...(synchronizer === undefined ? {} : { synchronizer })}
      >
        {children}
        <Inspector />
        <Toaster richColors />
      </Provider>
    </TetraContext>
  )
}
