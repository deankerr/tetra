import type { Row } from 'tinybase/with-schemas'

import type { Schemas } from './schemas.ts'
import type { AppIndexes, AppStore } from './store.ts'

// --- Codec ---

type SessionRow = Row<Schemas[0], 'sessions'>

export const decodeSession = (id: string, row: SessionRow) => ({
  agentId: row.agentId,
  createdAt: row.createdAt,
  id,
  lastSeq: row.lastSeq,
  title: row.title,
  updatedAt: row.updatedAt,
})

// --- Types ---

export type Session = ReturnType<typeof decodeSession>
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
    return decodeSession(id, store.getRow('sessions', id))
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
