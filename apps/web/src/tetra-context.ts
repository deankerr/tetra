import type { ModelCatalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import { createContext, useContext } from 'react'

import type { WebStoreInstances } from '@/stores/web'

export interface TetraAppContext {
  modelCatalog: ModelCatalog
  prompts: Prompts
  runConfigs: RunConfigs
  runs: Runs
  stores: WebStoreInstances
  transcripts: Transcripts
}

export const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within TetraProvider')
  }
  return ctx
}
