import type { UIMessage } from 'ai'
import type { Row } from 'tinybase/with-schemas'

import type { AppIndexes, AppStore, Schemas } from '../store.ts'

type MessageRow = Row<Schemas[0], 'messages'>

export const decodeMessage = (id: string, row: MessageRow) => ({
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

export type Message = ReturnType<typeof decodeMessage>

export const createMessages = (store: AppStore, indexes: AppIndexes) => ({
  get(id: string) {
    if (!store.hasRow('messages', id)) {
      return null
    }
    return decodeMessage(id, store.getRow('messages', id))
  },

  getOrThrow(id: string) {
    const message = this.get(id)
    if (message === null) {
      throw new Error(`Message not found: ${id}`)
    }
    return message
  },

  listIdsBySession(sessionId: string) {
    return indexes.getSliceRowIds('messagesBySession', sessionId)
  },

  listBySession(sessionId: string) {
    return this.listIdsBySession(sessionId)
      .map((id) => this.get(id))
      .filter((m): m is Message => m !== null)
  },

  // Context-gathering: load only the last N messages, optionally excluding specific IDs.
  listRecentBySession(sessionId: string, limit?: number, excludeIds?: string[]) {
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

  insert(
    id: string,
    sessionId: string,
    seq: number,
    role: UIMessage['role'],
    parts: UIMessage['parts'],
  ) {
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

  writeStreamChunk(id: string, message: UIMessage) {
    if (!store.hasRow('messages', id)) {
      return
    }
    store.setPartialRow('messages', id, { parts: message.parts, updatedAt: Date.now() })
  },

  delete(id: string) {
    store.delRow('messages', id)
  },
})
