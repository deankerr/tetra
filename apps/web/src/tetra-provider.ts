import type { Catalog, Prompts, Runner, Sessions, TetraStore } from '@tetra/core'
import { createContext, useContext } from 'react'

import type { StreamingState } from '@/streaming-state'

export interface TetraAppContext {
  activeCredentialId: string
  indexes: TetraStore['indexes']
  models: Catalog
  openCredentialSettings: (id: string) => void
  prompts: Prompts
  runner: Runner
  setSettingsOpen: (open: boolean) => void
  sessions: Sessions
  settingsOpen: boolean
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
