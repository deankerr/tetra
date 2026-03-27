import type { Row } from 'tinybase/with-schemas'

import type { AppIndexes, AppStore, Schemas } from '../store.ts'

// --- Codec ---

type SessionRow = Row<Schemas[0], 'sessions'>

export const decodeSession = (id: string, row: SessionRow) => ({
  createdAt: row.createdAt,
  id,
  lastSeq: row.lastSeq,
  title: row.title,
  updatedAt: row.updatedAt,
})

// --- Types ---

export type Session = ReturnType<typeof decodeSession>
export type SessionPatch = Partial<Omit<Session, 'createdAt' | 'id' | 'updatedAt'>>

// --- Table ---

export const createSessions = (store: AppStore, indexes: AppIndexes) => ({
  get(id: string) {
    if (!store.hasRow('sessions', id)) {
      return null
    }
    return decodeSession(id, store.getRow('sessions', id))
  },

  getOrThrow(id: string) {
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

  insert(id: string, title?: string) {
    const timestamp = Date.now()
    store.setRow('sessions', id, {
      createdAt: timestamp,
      lastSeq: 0,
      title: title ?? '',
      updatedAt: timestamp,
    })
  },

  update(id: string, patch: SessionPatch) {
    if (!store.hasRow('sessions', id)) {
      return
    }
    store.setPartialRow('sessions', id, { ...patch, updatedAt: Date.now() })
  },

  delete(id: string) {
    store.delRow('sessions', id)
  },
})
