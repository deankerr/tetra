import type { Catalog as CatalogType, Helpers as HelpersType, TetraDb } from '@tetra/core'
import { Catalog, Helpers, Runs, bindTetraDb, tetraDbDefinition } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import type { TinybaseIndexes } from '@tetra/tinybase-schema'
import { setTinybaseIndexDefinitions } from '@tetra/tinybase-schema'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { useMemo } from 'react'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { createIndexes } from 'tinybase/indexes/with-schemas'
import { createMergeableStore } from 'tinybase/mergeable-store/with-schemas'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import type { Store } from 'tinybase/store/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import { Inspector } from 'tinybase/ui-react-inspector'

import { TETRA_INDEXED_DB_NAME } from '@/lib/hard-reset'
import { TetraContext } from '@/tetra-context'
import type { DataMode } from '@/tetra-context'
import { tinybase } from '@/tetra-tinybase-react'

const DATA_MODE = import.meta.env.VITE_TETRA_DATA_MODE ?? 'memory'
const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'ws://localhost:8787'

interface TetraApp {
  catalog: CatalogType
  db: TetraDb
  helpers: HelpersType
  runs: Runs
}

type PlainDataMode = Exclude<DataMode, 'sync'>
type TetraStore = Store<
  [typeof tetraDbDefinition.tinybaseTablesSchema, typeof tetraDbDefinition.tinybaseValuesSchema]
>
type TetraIndexes = TinybaseIndexes<
  [typeof tetraDbDefinition.tinybaseTablesSchema, typeof tetraDbDefinition.tinybaseValuesSchema]
>

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

function createTetraApp(rawStore: TetraStore, rawIndexes: TetraIndexes): TetraApp {
  // Bind Tetra's typed APIs and core modules around the React-owned Store.
  const db = bindTetraDb(rawStore, rawIndexes)
  const helpers = new Helpers(db)
  const catalog = new Catalog(db)
  const runs = new Runs(helpers, credentialStore)

  return { catalog, db, helpers, runs }
}

function createConfiguredIndexes(rawStore: TetraStore): TetraIndexes {
  // Indexes are created by the web app and configured with Tetra's index definitions.
  const indexes = createIndexes(rawStore)
  setTinybaseIndexDefinitions(indexes, tetraDbDefinition.indexes)

  return indexes
}

export function TetraProvider({ children }: { children: React.ReactNode }) {
  const dataMode = getDataMode()

  if (dataMode === 'sync') {
    return <TetraSyncProvider>{children}</TetraSyncProvider>
  }

  return <TetraPlainProvider dataMode={dataMode}>{children}</TetraPlainProvider>
}

function TetraPlainProvider({
  children,
  dataMode,
}: {
  children: React.ReactNode
  dataMode: PlainDataMode
}) {
  // Plain web modes own Store creation and apply Tetra's schema directly.
  const rawStore = tinybase.useCreateStore(() =>
    createStore().setSchema(
      structuredClone(tetraDbDefinition.tinybaseTablesSchema),
      structuredClone(tetraDbDefinition.tinybaseValuesSchema),
    ),
  )

  // Keep indexes synchronous for now so core modules are available on the first render.
  const rawIndexes = useMemo(() => createConfiguredIndexes(rawStore), [rawStore])

  // Bind Tetra's typed APIs and core modules around the React-owned Store.
  const tetra = useMemo(() => createTetraApp(rawStore, rawIndexes), [rawIndexes, rawStore])

  // Local mode persists the plain Store to IndexedDB without blocking initial render.
  const persister = tinybase.useCreatePersister(
    dataMode === 'local' ? rawStore : undefined,
    async (store) => {
      const indexedDbPersister = createIndexedDbPersister(store, TETRA_INDEXED_DB_NAME)
      await indexedDbPersister.startAutoLoad()
      await indexedDbPersister.startAutoSave()
      return indexedDbPersister
    },
    [dataMode],
  )

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        dataMode,
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
        <Inspector />
        <Toaster richColors />
      </tinybase.Provider>
    </TetraContext>
  )
}

function TetraSyncProvider({ children }: { children: React.ReactNode }) {
  // Sync mode owns MergeableStore creation and applies Tetra's schema directly.
  const rawStore = tinybase.useCreateMergeableStore(() =>
    createMergeableStore().setSchema(
      structuredClone(tetraDbDefinition.tinybaseTablesSchema),
      structuredClone(tetraDbDefinition.tinybaseValuesSchema),
    ),
  )

  // Keep indexes synchronous for now so core modules are available on the first render.
  const rawIndexes = useMemo(() => createConfiguredIndexes(rawStore), [rawStore])

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
        dataMode: 'sync',
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
        <Toaster richColors />
      </tinybase.Provider>
    </TetraContext>
  )
}
