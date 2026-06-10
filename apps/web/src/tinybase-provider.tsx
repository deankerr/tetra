import { createRawMergeableStore, createRawStore } from '@tetra/store-schema'
import { useMemo } from 'react'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import { createStore } from 'tinybase/store/with-schemas'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas'
import { Inspector } from 'tinybase/ui-react-inspector'

import type { WebUiRawStore } from '@/lib/tinybase'
import {
  TETRA_INDEXED_DB_NAME,
  WEB_UI_STORE_ID,
  tinybase,
  webUiReact,
  webUiStoreSchema,
} from '@/lib/tinybase'
import { createSyncWebSocket } from '@/lib/websocket'

const DATA_MODE = import.meta.env.VITE_TETRA_DATA_MODE ?? 'persist'

function useCreateTetraStore() {
  return useMemo(() => createRawStore(), [])
}

function useCreateTetraMergeableStore() {
  return useMemo(() => createRawMergeableStore(), [])
}

function useCreateWebUiStore(): WebUiRawStore {
  return useMemo(() => {
    // Web UI state is intentionally tab-local: no persister, no synchronizer.
    const rawStore = createStore().setSchema(
      structuredClone(webUiStoreSchema.tablesSchema),
      structuredClone(webUiStoreSchema.valuesSchema),
    )

    rawStore.setValues({
      jsonView: { json: '', title: '' },
      settingsOpen: false,
    })

    // oxlint-disable-next-line no-unsafe-type-assertion -- The schema is applied immediately above.
    return rawStore as WebUiRawStore
  }, [])
}

function TinyBasePersisterProvider({ children }: { children: React.ReactNode }) {
  // Plain web modes create their rawStore/rawIndexes synchronously.
  const { rawIndexes, rawStore } = useCreateTetraStore()
  const webUiStore = useCreateWebUiStore()

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
      <webUiReact.Provider storesById={{ [WEB_UI_STORE_ID]: webUiStore }}>
        {children}
      </webUiReact.Provider>
    </tinybase.Provider>
  )
}

function TinyBaseSyncProvider({ children }: { children: React.ReactNode }) {
  // Sync mode creates its MergeableStore rawStore/rawIndexes synchronously.
  const { rawIndexes, rawStore } = useCreateTetraMergeableStore()
  const webUiStore = useCreateWebUiStore()

  const synchronizer = tinybase.useCreateSynchronizer(
    rawStore,
    async (store) => {
      const webSocket = createSyncWebSocket()
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
      <webUiReact.Provider storesById={{ [WEB_UI_STORE_ID]: webUiStore }}>
        {children}
      </webUiReact.Provider>
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
