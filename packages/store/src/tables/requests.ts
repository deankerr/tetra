import type { Row } from 'tinybase/with-schemas'
import { z } from 'zod'

import type { AppIndexes, AppStore, Schemas } from '../store.ts'
import { sessionConfigSchema } from '../utils.ts'
import type { SessionConfig } from '../utils.ts'

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
  config: decodeRequestConfig(row.config),
  createdAt: row.createdAt,
  errorMessage: row.errorMessage,
  id,
  messageId: row.messageId,
  sessionId: row.sessionId,
  status: isStatus(row.status) ? row.status : ('pending' as const),
  targetExecutorId: row.targetExecutorId,
})

export type RequestStatus = z.infer<typeof requestStatusSchema>
export type Request = ReturnType<typeof decodeRequest>
export type RequestPatch = Partial<Pick<Request, 'errorMessage' | 'status'>>

export const createRequests = (store: AppStore, indexes: AppIndexes) => ({
  get(id: string) {
    if (!store.hasRow('requests', id)) {
      return null
    }
    return decodeRequest(id, store.getRow('requests', id))
  },

  getOrThrow(id: string) {
    const request = this.get(id)
    if (request === null) {
      throw new Error(`Request not found: ${id}`)
    }
    return request
  },

  listIdsBySession(sessionId: string) {
    return indexes.getSliceRowIds('requestsBySession', sessionId)
  },

  getActiveForSession(sessionId: string) {
    const ids = indexes.getSliceRowIds('requestsBySession', sessionId)
    for (const id of ids) {
      const status = store.getCell('requests', id, 'status')
      if (status === 'pending' || status === 'streaming') {
        return decodeRequest(id, store.getRow('requests', id))
      }
    }
    return null
  },

  getLatestConfigForSession(sessionId: string) {
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

  insert(
    id: string,
    sessionId: string,
    messageId: string,
    assistantMessageId: string,
    config: SessionConfig,
    targetExecutorId: string,
  ) {
    store.setRow('requests', id, {
      assistantMessageId,
      config,
      createdAt: Date.now(),
      errorMessage: '',
      messageId,
      sessionId,
      status: 'pending',
      targetExecutorId,
    })
  },

  update(id: string, patch: RequestPatch) {
    if (!store.hasRow('requests', id)) {
      return
    }
    store.setPartialRow('requests', id, patch)
  },

  delete(id: string) {
    store.delRow('requests', id)
  },
})
