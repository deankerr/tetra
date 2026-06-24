import { createCoreModules } from '@tetra/core'
import { credentialStore } from '@tetra/credentials'
import { createTinyBaseProviderProps, StoreProvider } from '@tetra/tinybase-schema/react'
import { createContext, useContext, useMemo } from 'react'

import { createWebStoreInstances } from '@/store'
import type { WebStoreInstances } from '@/store'

type CoreModules = ReturnType<typeof createCoreModules>

export interface AppContextValue extends CoreModules {
  stores: WebStoreInstances
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Browser stores are created synchronously and kept volatile for now.
  const stores = useMemo(() => createWebStoreInstances(), [])
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

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (ctx === null) {
    throw new Error('useApp must be used within AppProvider')
  }
  return ctx
}
