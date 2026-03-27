import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import { createStore } from 'tinybase'
import { createLocalPersister } from 'tinybase/persisters/persister-browser'
import { Provider, useCreatePersister, useCreateStore } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { AppSidebar } from '@/components/app-sidebar'
import { SessionView } from '@/components/session/session-view'
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'
import { RuntimeContext } from '@/components/use-runtime'
import type { Runtime } from '@/lib/runtime'
import { getRuntime } from '@/lib/runtime'

export function App() {
  const [runtime, setRuntime] = useState<Runtime | null>(null)

  // UI store — ephemeral state (activeSessionId, draft configs, panel visibility)
  const uiStore = useCreateStore(createStore)
  useCreatePersister(
    uiStore,
    (store) => createLocalPersister(store, 'tetra-ui'),
    [],
    async (persister) => {
      await persister.startAutoLoad([{}, { activeSessionId: '' }])
      await persister.startAutoSave()
    },
  )

  useEffect(() => {
    const init = async () => {
      setRuntime(await getRuntime())
    }
    void init()
  }, [])

  // Loading state — runtime initializes store + persistence
  if (runtime === null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <Spinner className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    )
  }

  // Both stores are named — no defaults. Every hook must specify which store it targets.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeStore = runtime.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const runtimeIndexes = runtime.indexes as unknown as TinyIndexes

  return (
    <RuntimeContext value={runtime}>
      <Provider
        indexesById={{ runtime: runtimeIndexes }}
        storesById={{ runtime: runtimeStore, ui: uiStore }}
      >
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
