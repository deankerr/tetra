import type { Catalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import type { TetraTypedStore } from '@tetra/store-schema'
import { createContext, useContext } from 'react'

export interface TetraAppContext {
  catalog: Catalog
  prompts: Prompts
  runConfigs: RunConfigs
  runs: Runs
  transcripts: Transcripts
  typedStore: TetraTypedStore
}

export const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within TetraProvider')
  }
  return ctx
}
