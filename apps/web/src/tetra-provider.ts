import type { Catalog, Runner, Sessions, TetraStore } from '@tetra/core'
import { createContext, useContext } from 'react'

import type { StreamingState } from '@/streaming-state'

export interface TetraAppContext {
  indexes: TetraStore['indexes']
  models: Catalog
  runner: Runner
  sessions: Sessions
  store: TetraStore['store']
  streamingState: StreamingState
}

export const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within App')
  }
  return ctx
}
