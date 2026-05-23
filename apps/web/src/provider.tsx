import type { Catalog, DbSchemas, Store, TetraDb } from '@tetra/core'
import { Runs, createCoreModules, createTetraDb } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { Spinner } from '@tetra/ui/components/ui/spinner'
import { createContext, useContext, useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import type { MergeableStore } from 'tinybase/mergeable-store'
import type { Persister as TinyPersister } from 'tinybase/persisters'
import type { OpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import type { WsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

const WORKER_WS_URL = import.meta.env.VITE_WORKER_URL ?? 'ws://localhost:8787'

export interface SyncState {
  connected: boolean
  enabled: boolean
  toggle: () => void
}

export interface TetraAppContext {
  catalog: Catalog
  runs: Runs
  store: Store
  sync: SyncState
}

const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within TetraProvider')
  }
  return ctx
}

interface TetraApp {
  catalog: Catalog
  db: TetraDb
  runs: Runs
  store: Store
}

export function TetraProvider({ children }: { children: React.ReactNode }) {
  const [tetra] = useState<TetraApp>(() => {
    const db = createTetraDb()
    const core = createCoreModules(db)
    const runs = new Runs(core.store, credentialStore)
    return { catalog: core.catalog, db, runs, store: core.store }
  })
  const [persister, setPersister] = useState<OpfsPersister<DbSchemas> | null>(null)
  const [syncConnected, setSyncConnected] = useState(false)
  const [syncEnabled, setSyncEnabled] = useState(true)

  // OPFS persister — load once on startup, then auto-save on changes.
  // startAutoPersisting() also auto-loads, which re-reads after every save and triggers
  // another save — an infinite loop. Load + startAutoSave avoids this.
  useEffect(() => {
    let cancelled = false
    let opfsPersister: OpfsPersister<DbSchemas> | null = null

    const init = async () => {
      const root = await navigator.storage.getDirectory()
      const handle = await root.getFileHandle('tetra-redesign-runtime.json', { create: true })
      opfsPersister = createOpfsPersister(tetra.db.store, handle)
      await opfsPersister.load()

      if (cancelled) {
        await opfsPersister.destroy()
        return
      }

      void opfsPersister.startAutoSave()
      tetra.runs.recover()
      void tetra.catalog.refresh()
      setPersister(opfsPersister)
      console.log('opfs persister initialized')
    }

    void init()

    return () => {
      cancelled = true
      if (opfsPersister) {
        void opfsPersister.destroy()
        console.log('opfs persister destroyed')
      }
    }
  }, [tetra])

  // WS synchronizer — track connection state via WebSocket events for UI feedback.
  // Always return a cleanup; when disabled the init is skipped and cleanup is a safe no-op.
  // Track ws separately from synchronizer: cleanup may fire before the async init assigns
  // synchronizer, leaving the first WS alive with stale event listeners (StrictMode double-mount).
  useEffect(() => {
    // MergeableStore at runtime — cast is safe since createTetraDb uses createTinybaseMergeableStore.
    // oxlint-disable-next-line no-unsafe-type-assertion
    const mergeableStore = tetra.db.store as unknown as MergeableStore
    let cancelled = false
    let ws: WebSocket | null = null
    let synchronizer: WsSynchronizer<WebSocket> | null = null

    if (syncEnabled) {
      const init = async () => {
        ws = new WebSocket(`${WORKER_WS_URL}/tetra`)
        ws.addEventListener('open', () => {
          if (cancelled) {
            return
          }
          setSyncConnected(true)
        })
        ws.addEventListener('close', () => {
          if (cancelled) {
            return
          }
          setSyncConnected(false)
        })
        ws.addEventListener('error', (e) => {
          if (cancelled) {
            return
          }
          console.error('ws error', e)
          setSyncConnected(false)
        })

        synchronizer = await createWsSynchronizer(mergeableStore, ws)

        if (cancelled) {
          await synchronizer.destroy()
          return
        }

        await synchronizer.startSync()
        console.log('worker synchronizer started')
      }

      void init()
    }

    return () => {
      cancelled = true
      setSyncConnected(false)
      // destroy() calls ws.close() internally; if synchronizer isn't assigned yet, close ws directly
      if (synchronizer) {
        void synchronizer.destroy()
        console.log('worker synchronizer destroyed')
      } else if (ws) {
        ws.close()
      }
    }
  }, [tetra, syncEnabled])

  if (persister === null) {
    return (
      <div className="bg-background flex min-h-svh items-center justify-center">
        <div className="flex items-center gap-3">
          <Spinner className="text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Loading…</span>
        </div>
      </div>
    )
  }

  // TinyBase requires untyped store/indexes/persister for the Provider component.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeStore = tetra.db.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeIndexes = tetra.db.indexes.raw as unknown as TinyIndexes
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimePersister = persister as unknown as TinyPersister

  return (
    <TetraContext
      value={{
        catalog: tetra.catalog,
        runs: tetra.runs,
        store: tetra.store,
        sync: {
          connected: syncConnected,
          enabled: syncEnabled,
          toggle: () => {
            setSyncEnabled((prev) => !prev)
          },
        },
      }}
    >
      <Provider indexes={runtimeIndexes} persister={runtimePersister} store={runtimeStore}>
        {children}
        <Inspector />
        <Toaster richColors />
      </Provider>
    </TetraContext>
  )
}
