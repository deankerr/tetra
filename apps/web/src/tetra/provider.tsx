import type { Catalog, Runs, Store } from '@tetra/core-redesign'
import { createContext, useContext } from 'react'

export interface TetraAppContext {
  activeCredentialId: string
  catalog: Catalog
  openCredentialSettings: (id: string) => void
  runs: Runs
  setSettingsOpen: (open: boolean) => void
  settingsOpen: boolean
  store: Store
}

export const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within App')
  }
  return ctx
}
