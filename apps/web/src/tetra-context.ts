import type { Catalog, Helpers, Runs } from '@tetra/core'
import { createContext, useContext } from 'react'

export interface TetraAppContext {
  catalog: Catalog
  helpers: Helpers
  runs: Runs
}

export const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within TetraProvider')
  }
  return ctx
}
