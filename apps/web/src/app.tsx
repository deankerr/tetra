import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'
import type { TetraClient } from '@/runtime'
import { getTetra } from '@/runtime'
import { RuntimeContext } from '@/runtime/use-runtime'
import { SessionView } from '@/session/session-view'
import { AppSidebar } from '@/sidebar/app-sidebar'

export function App() {
  const [tetra, setTetra] = useState<TetraClient | null>(null)

  useEffect(() => {
    const init = async () => {
      setTetra(await getTetra())
    }
    void init()
  }, [])

  // Loading state — runtime initializes store + persistence
  if (tetra === null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <Spinner className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    )
  }

  // The store is named — no default. Every hook must specify its target store.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeStore = tetra.tinybase.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeIndexes = tetra.tinybase.indexes as unknown as TinyIndexes

  return (
    <RuntimeContext value={tetra}>
      <Provider indexesById={{ runtime: runtimeIndexes }} storesById={{ runtime: runtimeStore }}>
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
