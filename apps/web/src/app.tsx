import { createCoreModules, createTetraMergeableDb, Runs } from '@tetra/core-redesign'
import type {
  Catalog,
  DbSchemas,
  Prompts,
  Runs as RunsType,
  Sessions,
  TetraDb,
  Transcripts,
} from '@tetra/core-redesign'
import { credentialStore } from '@tetra/credentials'
import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Toaster } from '@tetra/ui/components/ui/sonner'
import { Spinner } from '@tetra/ui/components/ui/spinner'
import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import type { Persister as TinyPersister } from 'tinybase/persisters'
import type { OpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { SessionView } from '@/session/view'
import { AppSidebar } from '@/sidebar/app-sidebar'
import { TetraContext } from '@/tetra/provider'

interface TetraApp {
  accessors: ReturnType<typeof createCoreModules>['accessors']
  catalog: Catalog
  db: TetraDb
  indexes: TetraDb['indexes']
  prompts: Prompts
  runs: RunsType
  sessions: Sessions
  store: TetraDb['store']
  transcripts: Transcripts
}

export function App() {
  const [tetra] = useState<TetraApp>(() => {
    const db = createTetraMergeableDb()
    const core = createCoreModules(db)
    const runs = new Runs(core.accessors, credentialStore)

    console.log('store initialized')
    return {
      accessors: core.accessors,
      catalog: core.catalog,
      db,
      indexes: db.indexes,
      prompts: core.prompts,
      runs,
      sessions: core.sessions,
      store: db.store,
      transcripts: core.transcripts,
    }
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
      opfsPersister = createOpfsPersister(tetra.store, handle)
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

  // TinyBase uses the single-store provider form for the app runtime store.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeStore = tetra.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeIndexes = tetra.indexes as unknown as TinyIndexes
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimePersister = persister as unknown as TinyPersister
  const contextValue = {
    ...tetra,
    activeCredentialId,
    openCredentialSettings: (id: string) => {
      setActiveCredentialId(id)
      setSettingsOpen(true)
    },
    setSettingsOpen,
    settingsOpen,
  }

  return (
    <TetraContext value={contextValue}>
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
