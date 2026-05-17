import { createRunner, createSessions, createTetraMergeableStore } from '@tetra/core'
import type { Runner, Sessions, TetraSchemas, TetraStore } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Spinner } from '@tetra/ui/components/ui/spinner'
import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import type { Persister as TinyPersister } from 'tinybase/persisters'
import type { OpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { SessionView } from '@/session/session-view'
import { AppSidebar } from '@/sidebar/app-sidebar'
import { StreamingState } from '@/streaming-state'
import { TetraContext } from '@/tetra-provider'

interface TetraApp {
  indexes: TetraStore['indexes']
  runner: Runner
  sessions: Sessions
  store: TetraStore['store']
  streamingState: StreamingState
}

export function App() {
  const [tetra] = useState<TetraApp>(() => {
    const tetraStore = createTetraMergeableStore()
    const sessions = createSessions(tetraStore)
    const runner = createRunner(tetraStore, sessions, credentialStore)
    const streamingState = new StreamingState()

    console.log('store initialized')
    return {
      indexes: tetraStore.indexes,
      runner,
      sessions,
      store: tetraStore.store,
      streamingState,
    }
  })
  const [persister, setPersister] = useState<OpfsPersister<TetraSchemas> | null>(null)

  useEffect(() => {
    let cancelled = false
    let opfsPersister: OpfsPersister<TetraSchemas> | null = null

    const init = async () => {
      const root = await navigator.storage.getDirectory()
      const handle = await root.getFileHandle('tetra-runtime.json', { create: true })
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

      tetra.runner.recover()
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

  return (
    <TetraContext value={tetra}>
      <Provider store={runtimeStore} indexes={runtimeIndexes} persister={runtimePersister}>
        <SidebarProvider>
          <Sidebar>
            <AppSidebar />
          </Sidebar>

          <SidebarInset className="h-svh min-w-0 overflow-hidden">
            <SessionView />
          </SidebarInset>
        </SidebarProvider>

        <Inspector />
      </Provider>
    </TetraContext>
  )
}
