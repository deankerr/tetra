import type { Row } from 'tinybase/with-schemas'
import { z } from 'zod'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppIndexes, AppStore } from '@/lib/core/data/stores'
import { ui } from '@/lib/core/data/stores'

// --- Codec ---

type SessionRow = Row<Schemas[0], 'sessions'>

const SESSION_STATUSES = ['idle', 'streaming', 'error'] as const
const sessionStatusSchema = z.enum(SESSION_STATUSES)

const isStatus = (value: string): value is SessionStatus =>
  SESSION_STATUSES.some((s) => s === value)

const decode = (id: string, row: SessionRow) => ({
  agentId: row.agentId,
  createdAt: row.createdAt,
  errorMessage: row.errorMessage,
  id,
  lastSeq: row.lastSeq,
  status: isStatus(row.status) ? row.status : ('idle' as const),
  title: row.title,
  updatedAt: row.updatedAt,
})

// --- Types ---

export type SessionStatus = z.infer<typeof sessionStatusSchema>
export type Session = ReturnType<typeof decode>
export type SessionPatch = Partial<Omit<Session, 'createdAt' | 'id' | 'updatedAt'>>

// --- DAO ---

export type SessionDAO = {
  get: (id: string) => Session | null
  getOrThrow: (id: string) => Session
  listIds: () => string[]
  listIdsByRecency: () => string[]
  getStreamingIds: () => string[]
  insert: (id: string, agentId: string, title?: string) => void
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

  getStreamingIds() {
    return store
      .getRowIds('sessions')
      .filter((id) => store.getCell('sessions', id, 'status') === 'streaming')
  },

  insert(id, agentId, title) {
    const timestamp = Date.now()
    store.setRow('sessions', id, {
      agentId,
      createdAt: timestamp,
      errorMessage: '',
      lastSeq: 0,
      status: 'idle',
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

export const useActiveSessionId = () => ui.useValue('activeSessionId')

export const useSessionIds = () => ui.useSliceRowIds('sessionsByRecency', 'all')

export const useSession = (id: string): Session | null => {
  const hasRow = ui.useHasRow('sessions', id)
  const row = ui.useRow('sessions', id)
  return hasRow ? decode(id, row) : null
}
