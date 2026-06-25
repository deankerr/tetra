import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { createTinyBaseProviderProps, StoreProvider } from '@tetra/tinybase-schema/react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { createWebStoreRuntime } from '@/store'
import type { WebStoreInstances, WebStoreRuntime } from '@/store'

type CoreModules = ReturnType<typeof createCoreModules>

export interface AppContextValue extends CoreModules {
  stores: WebStoreInstances
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const runtime = useWebStoreRuntime()
  if (runtime === null) {
    return null
  }

  return <ReadyAppProvider runtime={runtime}>{children}</ReadyAppProvider>
}

function ReadyAppProvider({
  children,
  runtime,
}: {
  children: React.ReactNode
  runtime: WebStoreRuntime
}) {
  const { stores } = runtime
  const providerProps = useMemo(() => createTinyBaseProviderProps(stores), [stores])

  // Core modules are stable for the lifetime of the browser stores.
  const core = useMemo(
    () =>
      createCoreModules({
        credentials: credentialStore,
        stores: {
          catalogStore: stores.catalog,
          libraryStore: stores.library,
        },
      }),
    [stores],
  )

  const app = useMemo(() => ({ ...core, stores }), [core, stores])

  return (
    <StoreProvider indexesById={providerProps.indexesById} storesById={providerProps.storesById}>
      <AppContext value={app}>{children}</AppContext>
    </StoreProvider>
  )
}

function useWebStoreRuntime(): WebStoreRuntime | null {
  const [runtime, setRuntime] = useState<WebStoreRuntime | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let disposed = false
    let createdRuntime: WebStoreRuntime | undefined

    // Store startup is async because the library cache must load before reads begin.
    void (async () => {
      try {
        const nextRuntime = await createWebStoreRuntime()
        if (disposed) {
          await closeWebStoreRuntime(nextRuntime)
          return
        }
        createdRuntime = nextRuntime
        setRuntime(nextRuntime)
      } catch (nextError) {
        if (!disposed) {
          setError(toError(nextError))
        }
      }
    })()

    return () => {
      disposed = true
      if (createdRuntime !== undefined) {
        void closeWebStoreRuntime(createdRuntime)
      }
    }
  }, [])

  if (error !== null) {
    throw error
  }

  return runtime
}

async function closeWebStoreRuntime(runtime: WebStoreRuntime): Promise<void> {
  try {
    await runtime.close()
  } catch (error) {
    console.error('[app] failed to close web store runtime', error)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (ctx === null) {
    throw new Error('useApp must be used within AppProvider')
  }
  return ctx
}
