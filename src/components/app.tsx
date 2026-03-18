import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { AppSidebar } from '@/components/app-sidebar'
import { SessionView } from '@/components/session/session-view'
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'
import { CoreContext } from '@/components/use-core'
import type { Core } from '@/lib/core'
import { getCore } from '@/lib/core'

export function App() {
  const [core, setCore] = useState<Core | null>(null)

  useEffect(() => {
    const init = async () => {
      setCore(await getCore())
    }
    void init()
  }, [])

  // Loading state — core initializes store + persistence
  if (core === null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <Spinner className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    )
  }

  // Provider is schema-agnostic; typed hooks handle schema awareness via WithSchemas cast
  // oxlint-disable-next-line no-unsafe-type-assertion
  const store = core.data.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const indexes = core.data.indexes as unknown as TinyIndexes

  return (
    <CoreContext value={core}>
      <Provider indexes={indexes} store={store}>
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
    </CoreContext>
  )
}
