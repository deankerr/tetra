import { createTinyBaseProviderProps, StoreProvider } from '@tetra/tinybase-schema/react'
import { createContext, useContext, useMemo } from 'react'

import { createWebStoreInstances } from '@/stores/web'
import type { WebStoreInstances } from '@/stores/web'

const WebStoreInstancesContext = createContext<WebStoreInstances | null>(null)

export function TinyBaseProvider({ children }: { children: React.ReactNode }) {
  // Browser stores are created synchronously and kept volatile for now.
  const stores = useMemo(() => createWebStoreInstances(), [])
  const providerProps = useMemo(() => createTinyBaseProviderProps(stores), [stores])

  return (
    <WebStoreInstancesContext value={stores}>
      <StoreProvider indexesById={providerProps.indexesById} storesById={providerProps.storesById}>
        {children}
      </StoreProvider>
    </WebStoreInstancesContext>
  )
}

export function useWebStoreInstances(): WebStoreInstances {
  const stores = useContext(WebStoreInstancesContext)
  if (stores === null) {
    throw new Error('useWebStoreInstances must be used within TinyBaseProvider')
  }

  return stores
}
