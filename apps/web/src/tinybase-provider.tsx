import { createTinyBaseProviderProps } from '@tetra/stores'
import { StoreHostProvider } from '@tetra/stores/react'
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
      <StoreHostProvider
        indexesById={providerProps.indexesById}
        storesById={providerProps.storesById}
      >
        {children}
      </StoreHostProvider>
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
