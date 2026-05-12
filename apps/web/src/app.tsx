import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'
import type { TetraClient } from '@/runtime/tetra-client'
import { getTetra } from '@/runtime/tetra-client'
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

  // TinyBase uses the single-store provider form for the app runtime store.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeStore = tetra.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeIndexes = tetra.indexes as unknown as TinyIndexes

  return (
    <RuntimeContext value={tetra}>
      <Provider store={runtimeStore} indexes={runtimeIndexes}>
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
