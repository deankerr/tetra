import type { UIMessage } from 'ai'
import * as R from 'remeda'
import type { Row } from 'tinybase/with-schemas'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppIndexes, AppStore } from '@/lib/core/data/store'
import { CORE, reactCoreStore } from '@/lib/core/data/store'

// --- Codec ---

type MessageRow = Row<Schemas[0], 'messages'>

const decode = (id: string, row: MessageRow) => ({
  createdAt: row.createdAt,
  id,
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  parts: row.parts as UIMessage['parts'],
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  role: row.role as UIMessage['role'],
  seq: row.seq,
  sessionId: row.sessionId,
  updatedAt: row.updatedAt,
})

// --- Types ---

export type Message = ReturnType<typeof decode>

// --- DAO ---

export type MessageDAO = {
  get: (id: string) => Message | null
  getOrThrow: (id: string) => Message
  listIdsBySession: (sessionId: string) => string[]
  listBySession: (sessionId: string) => Message[]
  listRecentBySession: (sessionId: string, limit?: number, excludeIds?: string[]) => Message[]
  latestAssistant: (sessionId: string) => Message | null
  insert: (
    id: string,
    sessionId: string,
    seq: number,
    role: UIMessage['role'],
    parts: UIMessage['parts'],
  ) => void
  update: (id: string, role: string) => void
  writeStreamChunk: (id: string, message: UIMessage) => void
  delete: (id: string) => void
}

export const createMessageDAO = (store: AppStore, indexes: AppIndexes): MessageDAO => ({
  get(id) {
    if (!store.hasRow('messages', id)) {
      return null
    }
    return decode(id, store.getRow('messages', id))
  },

  getOrThrow(id) {
    const message = this.get(id)
    if (message === null) {
      throw new Error(`Message not found: ${id}`)
    }
    return message
  },

  listIdsBySession(sessionId) {
    return indexes.getSliceRowIds('messagesBySession', sessionId)
  },

  listBySession(sessionId) {
    return this.listIdsBySession(sessionId)
      .map((id) => this.get(id))
      .filter((m): m is Message => m !== null)
  },

  // Load only the last N messages, optionally excluding specific IDs (e.g. placeholder).
  // Slices the ID array before decoding to avoid loading the full history.
  listRecentBySession(sessionId, limit, excludeIds) {
    let ids = this.listIdsBySession(sessionId)
    if (excludeIds !== undefined && excludeIds.length > 0) {
      const excluded = new Set(excludeIds)
      ids = ids.filter((id) => !excluded.has(id))
    }
    if (limit !== undefined) {
      ids = ids.slice(-limit)
    }
    return ids.map((id) => this.get(id)).filter((m): m is Message => m !== null)
  },

  latestAssistant(sessionId) {
    const ids = indexes.getSliceRowIds('messagesBySession', sessionId)
    const match = R.findLast(ids, (mid) => store.getCell('messages', mid, 'role') === 'assistant')
    return match === undefined ? null : this.get(match)
  },

  insert(id, sessionId, seq, role, parts) {
    const timestamp = Date.now()
    store.setRow('messages', id, {
      createdAt: timestamp,
      parts,
      role,
      seq,
      sessionId,
      updatedAt: timestamp,
    })
  },

  // Update only the role of a message
  update(id, role) {
    if (!store.hasRow('messages', id)) {
      return
    }
    store.setPartialRow('messages', id, { role, updatedAt: Date.now() })
  },

  // Write a streamed UIMessage snapshot into the row
  writeStreamChunk(id, message) {
    if (!store.hasRow('messages', id)) {
      return
    }

    store.setPartialRow('messages', id, { parts: message.parts, updatedAt: Date.now() })
  },

  delete(id) {
    store.delRow('messages', id)
  },
})

// --- Hooks ---

export const useSessionMessageIds = (sessionId: string) =>
  reactCoreStore.useSliceRowIds('messagesBySession', sessionId, CORE)

export const useMessage = (id: string): Message | null => {
  const row = reactCoreStore.useRow('messages', id, CORE)
  if (!row.createdAt) {
    return null
  }
  return decode(id, row)
}
