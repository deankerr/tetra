import { Runs, createCoreModules, createTetraDb } from '@tetra/core'
import type { Catalog, DbSchemas, TetraDb, Store } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { Spinner } from '@tetra/ui/components/ui/spinner'
import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import type { MergeableStore } from 'tinybase/mergeable-store'
import type { Persister as TinyPersister } from 'tinybase/persisters'
import type { OpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import type { WsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { SessionView } from '@/session/view'
import { AppSidebar } from '@/sidebar/app-sidebar'
import { TetraContext } from '@/tetra/provider'

const WORKER_WS_URL = import.meta.env.VITE_WORKER_URL ?? 'ws://localhost:8787'

interface TetraApp {
  catalog: Catalog
  db: TetraDb
  runs: Runs
  store: Store
}

export function App() {
  const [tetra] = useState<TetraApp>(() => {
    const db = createTetraDb()
    const core = createCoreModules(db)
    const runs = new Runs(core.store, credentialStore)

    console.log('store initialized')
    return { catalog: core.catalog, db, runs, store: core.store }
  })
  const [persister, setPersister] = useState<OpfsPersister<DbSchemas> | null>(null)
  const [activeCredentialId, setActiveCredentialId] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    let opfsPersister: OpfsPersister<DbSchemas> | null = null

    const init = async () => {
      const root = await navigator.storage.getDirectory()
      const handle = await root.getFileHandle('tetra-redesign-runtime.json', { create: true })
      opfsPersister = createOpfsPersister(tetra.db.store, handle)
      // Load once on startup, then auto-save on store changes.
      // startAutoPersisting() also starts auto-load, which re-reads the file after every
      // save and produces a merge mutation, triggering another save — an infinite loop.
      await opfsPersister.load()
      void opfsPersister.startAutoSave()

      if (cancelled) {
        await opfsPersister.destroy()
        console.log('opfs persister cancelled')
        return
      }

      tetra.runs.recover()
      void tetra.catalog.refresh()
      setPersister(opfsPersister)
      console.log('opfs persister initialized')
    }

    void init()

    return () => {
      cancelled = true
      void opfsPersister?.destroy()
      console.log('opfs persister destroyed')
    }
  }, [tetra])

  useEffect(() => {
    // MergeableStore at runtime — cast is safe since createTetraDb uses createTinybaseMergeableStore.
    // oxlint-disable-next-line no-unsafe-type-assertion
    const mergeableStore = tetra.db.store as unknown as MergeableStore
    let cancelled = false
    let synchronizer: WsSynchronizer<WebSocket> | null = null

    const init = async () => {
      const ws = new WebSocket(`${WORKER_WS_URL}/tetra`)
      synchronizer = await createWsSynchronizer(mergeableStore, ws)
      await synchronizer.startSync()

      if (cancelled) {
        await synchronizer.destroy()
        console.log('worker synchronizer cancelled')
        return
      }

      console.log('worker synchronizer started')
    }

    void init()

    return () => {
      cancelled = true
      void synchronizer?.destroy()
      console.log('worker synchronizer destroyed')
    }
  }, [tetra])

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
        activeCredentialId,
        catalog: tetra.catalog,
        openCredentialSettings: (id: string) => {
          setActiveCredentialId(id)
          setSettingsOpen(true)
        },
        runs: tetra.runs,
        setSettingsOpen,
        settingsOpen,
        store: tetra.store,
      }}
    >
      <Provider store={runtimeStore} indexes={runtimeIndexes} persister={runtimePersister}>
        <SidebarProvider>
          <Sidebar>
            <AppSidebar />
          </Sidebar>

          <SidebarInset className="h-svh min-w-0 overflow-hidden">
            <div className="flex h-full overflow-x-auto">
              <SessionView />
            </div>
          </SidebarInset>
        </SidebarProvider>

        <Inspector />
        <Toaster richColors />
      </Provider>
    </TetraContext>
  )
}
