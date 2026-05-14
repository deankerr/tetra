import { createTetraRuntime } from '@tetra/runtime'
import type { TetraRuntime } from '@tetra/runtime'
import { createTetraStore } from '@tetra/store'
import type { Schemas, TetraStore } from '@tetra/store'
import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Spinner } from '@tetra/ui/components/ui/spinner'
import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import type { Persister as TinyPersister } from 'tinybase/persisters'
import type { OpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { createOpfsPersister } from 'tinybase/persisters/persister-browser/with-schemas'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { RuntimeContext } from '@/runtime/use-runtime'
import { SessionView } from '@/session/session-view'
import { AppSidebar } from '@/sidebar/app-sidebar'

interface TetraApp {
  indexes: TetraStore['indexes']
  runtime: TetraRuntime
  store: TetraStore['store']
}

export function App() {
  const [tetra] = useState<TetraApp>(() => {
    // Store, indexes, and runtime are synchronous app-local objects.
    const tetraStore = createTetraStore()
    const runtime = createTetraRuntime({
      store: tetraStore,
    })

    return {
      indexes: tetraStore.indexes,
      runtime,
      store: tetraStore.store,
    }
  })
  const [persister, setPersister] = useState<OpfsPersister<Schemas> | null>(null)

  useEffect(() => {
    let cancelled = false
    let opfsPersister: OpfsPersister<Schemas> | null = null

    const init = async () => {
      // OPFS persistence must load before runtime recovery.
      const root = await navigator.storage.getDirectory()
      const handle = await root.getFileHandle('tetra-runtime.json', { create: true })
      opfsPersister = createOpfsPersister(tetra.store, handle)
      await opfsPersister.startAutoPersisting()

      if (cancelled) {
        await opfsPersister.destroy()
        return
      }

      tetra.runtime.recoverInterruptedRequests()
      setPersister(opfsPersister)
    }

    void init()

    return () => {
      cancelled = true
      tetra.runtime.stop()
      void opfsPersister?.destroy()
    }
  }, [tetra])

  // Loading state — OPFS persistence hydrates the runtime store.
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
    <RuntimeContext value={tetra.runtime}>
      <Provider store={runtimeStore} indexes={runtimeIndexes} persister={runtimePersister}>
        <SidebarProvider>
          <Sidebar>
            <AppSidebar />
          </Sidebar>

          {/* Workspace: the bounded content area to the right of the sidebar.
              min-w-0 breaks the flex minimum width default so children can't
              push the viewport wider. overflow-hidden contains all descendant
              overflow — views handle their own scrolling internally. */}
          <SidebarInset className="h-svh min-w-0 overflow-hidden">
            <SessionView />
          </SidebarInset>
        </SidebarProvider>

        <Inspector />
      </Provider>
    </RuntimeContext>
  )
}
