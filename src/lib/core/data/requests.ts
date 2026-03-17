import type { Row } from 'tinybase/with-schemas'
import { z } from 'zod'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppIndexes, AppStore } from '@/lib/core/data/stores'
import { ui } from '@/lib/core/data/stores'

// --- Codec ---

type RequestRow = Row<Schemas[0], 'requests'>

const REQUEST_STATUSES = ['pending', 'streaming', 'completed', 'cancelled', 'error'] as const
const requestStatusSchema = z.enum(REQUEST_STATUSES)

const isStatus = (value: string): value is RequestStatus =>
  REQUEST_STATUSES.some((s) => s === value)

const decode = (id: string, row: RequestRow) => ({
  assistantMessageId: row.assistantMessageId,
  createdAt: row.createdAt,
  errorMessage: row.errorMessage,
  id,
  messageId: row.messageId,
  sessionId: row.sessionId,
  status: isStatus(row.status) ? row.status : ('pending' as const),
})

// --- Types ---

export type RequestStatus = z.infer<typeof requestStatusSchema>
export type Request = ReturnType<typeof decode>
export type RequestPatch = Partial<Pick<Request, 'errorMessage' | 'status'>>

// --- DAO ---

export type RequestDAO = {
  get: (id: string) => Request | null
  getOrThrow: (id: string) => Request
  getActiveForSession: (sessionId: string) => Request | null
  insert: (id: string, sessionId: string, messageId: string, assistantMessageId: string) => void
  update: (id: string, patch: RequestPatch) => void
  delete: (id: string) => void
}

export const createRequestDAO = (store: AppStore, indexes: AppIndexes): RequestDAO => ({
  get(id) {
    if (!store.hasRow('requests', id)) {
      return null
    }
    return decode(id, store.getRow('requests', id))
  },

  getOrThrow(id) {
    const request = this.get(id)
    if (request === null) {
      throw new Error(`Request not found: ${id}`)
    }
    return request
  },

  getActiveForSession(sessionId) {
    const ids = indexes.getSliceRowIds('requestsBySession', sessionId)
    for (const id of ids) {
      const status = store.getCell('requests', id, 'status')
      if (status === 'pending' || status === 'streaming') {
        return decode(id, store.getRow('requests', id))
      }
    }
    return null
  },

  insert(id, sessionId, messageId, assistantMessageId) {
    store.setRow('requests', id, {
      assistantMessageId,
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

// --- Hooks ---

/** Returns the currently active (pending/streaming) request for a session, or null. */
export const useActiveRequest = (sessionId: string): Request | null => {
  const ids = ui.useSliceRowIds('requestsBySession', sessionId)
  const latestId = ids[0] ?? ''
  const hasRow = ui.useHasRow('requests', latestId)
  const row = ui.useRow('requests', latestId)

  if (!hasRow || latestId === '') {
    return null
  }
  if (row.status !== 'pending' && row.status !== 'streaming') {
    return null
  }

  return decode(latestId, row)
}

/** Returns the most recent request for a session regardless of status. */
export const useLatestRequest = (sessionId: string): Request | null => {
  const ids = ui.useSliceRowIds('requestsBySession', sessionId)
  const latestId = ids[0] ?? ''
  const hasRow = ui.useHasRow('requests', latestId)
  const row = ui.useRow('requests', latestId)

  if (!hasRow || latestId === '') {
    return null
  }

  return decode(latestId, row)
}

/** Looks up the request linked to an assistant message. Returns null for user messages. */
export const useRequestForMessage = (messageId: string): Request | null => {
  const ids = ui.useSliceRowIds('requestByAssistantMessage', messageId)
  const requestId = ids[0] ?? ''
  const hasRow = ui.useHasRow('requests', requestId)
  const row = ui.useRow('requests', requestId)

  if (!hasRow || requestId === '') {
    return null
  }

  return decode(requestId, row)
}
