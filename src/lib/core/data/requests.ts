import { useMemo } from 'react'
import type { Row } from 'tinybase/with-schemas'
import { z } from 'zod'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppIndexes, AppStore } from '@/lib/core/data/store'
import { CORE, reactCoreStore } from '@/lib/core/data/store'
import { sessionConfigSchema } from '@/lib/shared/session-config'
import type { SessionConfig } from '@/lib/shared/session-config'

// --- Codec ---

type RequestRow = Row<Schemas[0], 'requests'>

const REQUEST_STATUSES = ['pending', 'streaming', 'completed', 'cancelled', 'error'] as const
const requestStatusSchema = z.enum(REQUEST_STATUSES)

const isStatus = (value: string): value is RequestStatus =>
  REQUEST_STATUSES.some((s) => s === value)

const decodeConfig = (raw: unknown) => {
  const result = sessionConfigSchema.safeParse(raw)
  return result.success ? result.data : null
}

const decode = (id: string, row: RequestRow) => ({
  assistantMessageId: row.assistantMessageId,
  config: decodeConfig(row.config),
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
  getLatestConfigForSession: (sessionId: string) => SessionConfig | null
  listIdsBySession: (sessionId: string) => string[]
  insert: (
    id: string,
    sessionId: string,
    messageId: string,
    assistantMessageId: string,
    config: SessionConfig,
  ) => void
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

  listIdsBySession(sessionId) {
    return indexes.getSliceRowIds('requestsBySession', sessionId)
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

  getLatestConfigForSession(sessionId) {
    const ids = indexes.getSliceRowIds('requestsBySession', sessionId)
    for (const id of ids) {
      const raw = store.getCell('requests', id, 'config')
      const config = decodeConfig(raw)
      if (config !== null) {
        return config
      }
    }
    return null
  },

  insert(id, sessionId, messageId, assistantMessageId, config) {
    store.setRow('requests', id, {
      assistantMessageId,
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

// --- Hooks ---

/** Returns the currently active (pending/streaming) request for a session, or null. */
export const useActiveRequest = (sessionId: string): Request | null => {
  const ids = reactCoreStore.useSliceRowIds('requestsBySession', sessionId, CORE)
  const latestId = ids[0] ?? ''
  const hasRow = reactCoreStore.useHasRow('requests', latestId, CORE)
  const row = reactCoreStore.useRow('requests', latestId, CORE)

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
  const ids = reactCoreStore.useSliceRowIds('requestsBySession', sessionId, CORE)
  const latestId = ids[0] ?? ''
  const hasRow = reactCoreStore.useHasRow('requests', latestId, CORE)
  const row = reactCoreStore.useRow('requests', latestId, CORE)

  if (!hasRow || latestId === '') {
    return null
  }

  return decode(latestId, row)
}

/** Looks up the request linked to an assistant message. Returns null for user messages. */
export const useRequestForMessage = (messageId: string): Request | null => {
  const ids = reactCoreStore.useSliceRowIds('requestByAssistantMessage', messageId, CORE)
  const requestId = ids[0] ?? ''
  const hasRow = reactCoreStore.useHasRow('requests', requestId, CORE)
  const row = reactCoreStore.useRow('requests', requestId, CORE)

  if (!hasRow || requestId === '') {
    return null
  }

  return decode(requestId, row)
}

/** Returns the inference config from the most recent request for a session, or null. */
export const useLatestConfig = (sessionId: string): SessionConfig | null => {
  const ids = reactCoreStore.useSliceRowIds('requestsBySession', sessionId, CORE)
  const latestId = ids[0] ?? ''
  const raw = reactCoreStore.useCell('requests', latestId, 'config', CORE)

  return useMemo(() => {
    if (latestId === '') {
      return null
    }
    return decodeConfig(raw)
  }, [latestId, raw])
}
