import type {
  Accessors,
  Catalog,
  Prompts,
  Runs,
  Sessions,
  TetraDb,
  Transcripts,
} from '@tetra/core-redesign'
import { createContext, useContext } from 'react'

export interface TetraAppContext {
  accessors: Accessors
  activeCredentialId: string
  catalog: Catalog
  db: TetraDb
  indexes: TetraDb['indexes']
  openCredentialSettings: (id: string) => void
  prompts: Prompts
  runs: Runs
  sessions: Sessions
  setSettingsOpen: (open: boolean) => void
  settingsOpen: boolean
  store: TetraDb['store']
  transcripts: Transcripts
}

export const TetraContext = createContext<TetraAppContext | null>(null)

export function useTetra(): TetraAppContext {
  const ctx = useContext(TetraContext)
  if (ctx === null) {
    throw new Error('useTetra must be used within App')
  }
  return ctx
}
