import type { Row } from 'tinybase/with-schemas'
import { z } from 'zod'

import { sessionConfigSchema } from '../config.ts'
import type { SessionConfig } from '../config.ts'
import type { Schemas } from './schemas.ts'
import type { AppIndexes, AppStore } from './store.ts'

// --- Codec ---

type RequestRow = Row<Schemas[0], 'requests'>

const REQUEST_STATUSES = ['pending', 'streaming', 'completed', 'cancelled', 'error'] as const
const requestStatusSchema = z.enum(REQUEST_STATUSES)

const isStatus = (value: string): value is RequestStatus =>
  REQUEST_STATUSES.some((s) => s === value)

export const decodeRequestConfig = (raw: unknown) => {
  const result = sessionConfigSchema.safeParse(raw)
  return result.success ? result.data : null
}

export const decodeRequest = (id: string, row: RequestRow) => ({
  assistantMessageId: row.assistantMessageId,
  claimedBy: row.claimedBy,
  config: decodeRequestConfig(row.config),
  createdAt: row.createdAt,
  errorMessage: row.errorMessage,
  id,
  messageId: row.messageId,
  sessionId: row.sessionId,
  status: isStatus(row.status) ? row.status : ('pending' as const),
})

// --- Types ---

export type RequestStatus = z.infer<typeof requestStatusSchema>
export type Request = ReturnType<typeof decodeRequest>
export type RequestPatch = Partial<Pick<Request, 'errorMessage' | 'status'>>

// --- DAO ---

export type RequestDAO = {
  get: (id: string) => Request | null
  getOrThrow: (id: string) => Request
  getActiveForSession: (sessionId: string) => Request | null
  getLatestConfigForSession: (sessionId: string) => SessionConfig | null
  listIdsBySession: (sessionId: string) => string[]
  insert: (
    id: string,
    sessionId: string,
    messageId: string,
    assistantMessageId: string,
    config: SessionConfig,
    claimedBy: string,
  ) => void
  update: (id: string, patch: RequestPatch) => void
  delete: (id: string) => void
}

export const createRequestDAO = (store: AppStore, indexes: AppIndexes): RequestDAO => ({
  get(id) {
    if (!store.hasRow('requests', id)) {
      return null
    }
    return decodeRequest(id, store.getRow('requests', id))
  },

  getOrThrow(id) {
    const request = this.get(id)
    if (request === null) {
      throw new Error(`Request not found: ${id}`)
    }
    return request
  },

  listIdsBySession(sessionId) {
    return indexes.getSliceRowIds('requestsBySession', sessionId)
  },

  getActiveForSession(sessionId) {
    const ids = indexes.getSliceRowIds('requestsBySession', sessionId)
    for (const id of ids) {
      const status = store.getCell('requests', id, 'status')
      if (status === 'pending' || status === 'streaming') {
        return decodeRequest(id, store.getRow('requests', id))
      }
    }
    return null
  },

  getLatestConfigForSession(sessionId) {
    const ids = indexes.getSliceRowIds('requestsBySession', sessionId)
    for (const id of ids) {
      const raw = store.getCell('requests', id, 'config')
      const config = decodeRequestConfig(raw)
      if (config !== null) {
        return config
      }
    }
    return null
  },

  insert(id, sessionId, messageId, assistantMessageId, config, claimedBy) {
    store.setRow('requests', id, {
      assistantMessageId,
      claimedBy,
      config,
      createdAt: Date.now(),
      errorMessage: '',
      messageId,
      sessionId,
      status: 'pending',
    })
  },

  update(id, patch) {
    if (!store.hasRow('requests', id)) {
      return
    }
    store.setPartialRow('requests', id, patch)
  },

  delete(id) {
    store.delRow('requests', id)
  },
})
