import { Sidebar, SidebarInset, SidebarProvider } from '@tetra/ui/components/ui/sidebar'
import { Spinner } from '@tetra/ui/components/ui/spinner'
import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import type { Persister as TinyPersister } from 'tinybase/persisters'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import type { TetraApp } from '@/runtime/tetra-client'
import { getTetra } from '@/runtime/tetra-client'
import { RuntimeContext } from '@/runtime/use-runtime'
import { SessionView } from '@/session/session-view'
import { AppSidebar } from '@/sidebar/app-sidebar'

export function App() {
  const [tetra, setTetra] = useState<TetraApp | null>(null)

  useEffect(() => {
    const init = async () => {
      setTetra(await getTetra())
    }
    void init()
  }, [])

  // Loading state — OPFS persistence hydrates the runtime store.
  if (tetra === null) {
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
  const runtimePersister = tetra.persister as unknown as TinyPersister

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
