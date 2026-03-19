import type { Row } from 'tinybase/with-schemas'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppIndexes, AppStore } from '@/lib/core/data/store'
import { CORE, reactCoreStore } from '@/lib/core/data/store'
import { useUiValue } from '@/lib/ui'

// --- Codec ---

type SessionRow = Row<Schemas[0], 'sessions'>

const decode = (id: string, row: SessionRow) => ({
  agentId: row.agentId,
  createdAt: row.createdAt,
  id,
  lastSeq: row.lastSeq,
  title: row.title,
  updatedAt: row.updatedAt,
})

// --- Types ---

export type Session = ReturnType<typeof decode>
export type SessionPatch = Partial<Omit<Session, 'createdAt' | 'id' | 'updatedAt'>>

// --- DAO ---

export type SessionDAO = {
  get: (id: string) => Session | null
  getOrThrow: (id: string) => Session
  listIds: () => string[]
  listIdsByRecency: () => string[]
  hasSessionsForAgent: (agentId: string) => boolean
  insert: (id: string, title?: string) => void
  update: (id: string, patch: SessionPatch) => void
  delete: (id: string) => void
}

export const createSessionDAO = (store: AppStore, indexes: AppIndexes): SessionDAO => ({
  get(id) {
    if (!store.hasRow('sessions', id)) {
      return null
    }
    return decode(id, store.getRow('sessions', id))
  },

  getOrThrow(id) {
    const session = this.get(id)
    if (session === null) {
      throw new Error(`Session not found: ${id}`)
    }
    return session
  },

  listIds() {
    return store.getRowIds('sessions')
  },

  listIdsByRecency() {
    return indexes.getSliceRowIds('sessionsByRecency', 'all')
  },

  hasSessionsForAgent(agentId) {
    return this.listIds().some((id) => store.getCell('sessions', id, 'agentId') === agentId)
  },

  insert(id, title) {
    const timestamp = Date.now()
    store.setRow('sessions', id, {
      agentId: '',
      createdAt: timestamp,
      lastSeq: 0,
      title: title ?? '',
      updatedAt: timestamp,
    })
  },

  update(id, patch) {
    if (!store.hasRow('sessions', id)) {
      return
    }
    store.setPartialRow('sessions', id, { ...patch, updatedAt: Date.now() })
  },

  delete(id) {
    store.delRow('sessions', id)
  },
})

// --- Hooks ---

export const useActiveSessionId = () => {
  const value = useUiValue('activeSessionId')
  return typeof value === 'string' ? value : undefined
}

export const useSessionIds = () => reactCoreStore.useSliceRowIds('sessionsByRecency', 'all', CORE)

export const useSession = (id: string): Session | null => {
  const hasRow = reactCoreStore.useHasRow('sessions', id, CORE)
  const row = reactCoreStore.useRow('sessions', id, CORE)
  return hasRow ? decode(id, row) : null
}
