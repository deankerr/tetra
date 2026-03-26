import { decodeMessage, decodeRequest, decodeRequestConfig, decodeSession } from '@tetra/runtime'
import type { Message, Request, Schemas, Session, SessionConfig } from '@tetra/runtime'
import { useMemo } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const coreStore = UiReact as unknown as UiReact.WithSchemas<Schemas>

const CORE = 'core' as const

// --- Session Hooks ---

export const useSessionIds = () => coreStore.useSliceRowIds('sessionsByRecency', 'all', CORE)

export const useSession = (id: string): Session | null => {
  const hasRow = coreStore.useHasRow('sessions', id, CORE)
  const row = coreStore.useRow('sessions', id, CORE)
  return hasRow ? decodeSession(id, row) : null
}

// --- Message Hooks ---

export const useSessionMessageIds = (sessionId: string) =>
  coreStore.useSliceRowIds('messagesBySession', sessionId, CORE)

export const useMessage = (id: string): Message | null => {
  const row = coreStore.useRow('messages', id, CORE)
  if (!row.createdAt) {
    return null
  }
  return decodeMessage(id, row)
}

// --- Request Hooks ---

/** Returns the currently active (pending/streaming) request for a session, or null. */
export const useActiveRequest = (sessionId: string): Request | null => {
  const ids = coreStore.useSliceRowIds('requestsBySession', sessionId, CORE)
  const latestId = ids[0] ?? ''
  const hasRow = coreStore.useHasRow('requests', latestId, CORE)
  const row = coreStore.useRow('requests', latestId, CORE)

  if (!hasRow || latestId === '') {
    return null
  }
  if (row.status !== 'pending' && row.status !== 'streaming') {
    return null
  }

  return decodeRequest(latestId, row)
}

/** Returns the most recent request for a session regardless of status. */
export const useLatestRequest = (sessionId: string): Request | null => {
  const ids = coreStore.useSliceRowIds('requestsBySession', sessionId, CORE)
  const latestId = ids[0] ?? ''
  const hasRow = coreStore.useHasRow('requests', latestId, CORE)
  const row = coreStore.useRow('requests', latestId, CORE)

  if (!hasRow || latestId === '') {
    return null
  }

  return decodeRequest(latestId, row)
}

/** Looks up the request linked to an assistant message. Returns null for user messages. */
export const useRequestForMessage = (messageId: string): Request | null => {
  const ids = coreStore.useSliceRowIds('requestByAssistantMessage', messageId, CORE)
  const requestId = ids[0] ?? ''
  const hasRow = coreStore.useHasRow('requests', requestId, CORE)
  const row = coreStore.useRow('requests', requestId, CORE)

  if (!hasRow || requestId === '') {
    return null
  }

  return decodeRequest(requestId, row)
}

/** Returns the inference config from the most recent request for a session, or null. */
export const useLatestConfig = (sessionId: string): SessionConfig | null => {
  const ids = coreStore.useSliceRowIds('requestsBySession', sessionId, CORE)
  const latestId = ids[0] ?? ''
  const raw = coreStore.useCell('requests', latestId, 'config', CORE)

  return useMemo(() => {
    if (latestId === '') {
      return null
    }
    return decodeRequestConfig(raw)
  }, [latestId, raw])
}
