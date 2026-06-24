import { createTinyBaseProviderProps, StoreProvider } from '@tetra/tinybase-schema/react'
import { createContext, useContext, useMemo } from 'react'

import { createWebStores } from '@/stores/web'
import type { WebStores } from '@/stores/web'

const WebStoresContext = createContext<WebStores | null>(null)

export function TinyBaseProvider({ children }: { children: React.ReactNode }) {
  // Browser stores are created synchronously and kept volatile for now.
  const stores = useMemo(() => createWebStores(), [])
  const providerProps = useMemo(() => createTinyBaseProviderProps(stores), [stores])

  return (
    <WebStoresContext value={stores}>
      <StoreProvider indexesById={providerProps.indexesById} storesById={providerProps.storesById}>
        {children}
      </StoreProvider>
    </WebStoresContext>
  )
}

export function useWebStores(): WebStores {
  const stores = useContext(WebStoresContext)
  if (stores === null) {
    throw new Error('useWebStores must be used within TinyBaseProvider')
  }

  return stores
}
