import { DEFAULT_SESSION_CONFIG, decodeMessage, decodeRequest, decodeSession } from '@tetra/store'
import type { Message, Request, Schemas, Session, SessionConfig } from '@tetra/store'
import * as UiReact from 'tinybase/ui-react/with-schemas'

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const store = UiReact as unknown as UiReact.WithSchemas<Schemas>

// --- App State Hooks ---

export const useActiveSessionId = () => {
  const value = store.useValue('activeSessionId')
  return typeof value === 'string' ? value : undefined
}

export const useActiveSessionIdState = () => store.useValueState('activeSessionId')

// --- Session Hooks ---

export const useSessionIds = () => store.useSliceRowIds('sessionsByRecency', 'all')

export const useSession = (id: string): Session | null => {
  const hasRow = store.useHasRow('sessions', id)
  const row = store.useRow('sessions', id)
  return hasRow ? decodeSession(id, row) : null
}

export const useSessionConfig = (id: string): SessionConfig => {
  const session = useSession(id)
  return session?.config ?? DEFAULT_SESSION_CONFIG
}

// --- Message Hooks ---

export const useSessionMessageIds = (sessionId: string) =>
  store.useSliceRowIds('messagesBySession', sessionId)

export const useMessage = (id: string): Message | null => {
  const row = store.useRow('messages', id)
  if (!row.createdAt) {
    return null
  }
  return decodeMessage(id, row)
}

// --- Request Hooks ---

/** Returns the currently active (pending/streaming) request for a session, or null. */
export const useActiveRequest = (sessionId: string): Request | null => {
  const ids = store.useSliceRowIds('requestsBySession', sessionId)
  const latestId = ids[0] ?? ''
  const hasRow = store.useHasRow('requests', latestId)
  const row = store.useRow('requests', latestId)

  if (!hasRow || latestId === '') {
    return null
  }
  if (row.status !== 'pending' && row.status !== 'streaming') {
    return null
  }

  return decodeRequest(latestId, row)
}

/** Looks up the request linked to an assistant message. Returns null for user messages. */
export const useRequestForMessage = (messageId: string): Request | null => {
  const ids = store.useSliceRowIds('requestByAssistantMessage', messageId)
  const requestId = ids[0] ?? ''
  const hasRow = store.useHasRow('requests', requestId)
  const row = store.useRow('requests', requestId)

  if (!hasRow || requestId === '') {
    return null
  }

  return decodeRequest(requestId, row)
}
