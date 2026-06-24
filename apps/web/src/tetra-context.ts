import type { Catalog, Prompts, RunConfigs, Runs, Transcripts } from '@tetra/core'
import type { CatalogTypedStore, LibraryTypedStore } from '@tetra/stores'
import { createContext, useContext } from 'react'

import type { WebTypedStore } from '@/stores/web'

export interface TetraAppContext {
  catalog: Catalog
  catalogStore: CatalogTypedStore
  libraryStore: LibraryTypedStore
  prompts: Prompts
  runConfigs: RunConfigs
  runs: Runs
  transcripts: Transcripts
  webStore: WebTypedStore
}

export const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within TetraProvider')
  }
  return ctx
}
