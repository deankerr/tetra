import { DEFAULT_SESSION_CONFIG, decodeMessage, decodeRequest, decodeSession } from '@tetra/store'
import type { Message, Request, Schemas, Session, SessionConfig } from '@tetra/store'
import * as UiReact from 'tinybase/ui-react/with-schemas'

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const runtimeStore = UiReact as unknown as UiReact.WithSchemas<Schemas>

const RUNTIME = 'runtime' as const

// --- App State Hooks ---

export const useActiveSessionId = () => {
  const value = runtimeStore.useValue('activeSessionId', RUNTIME)
  return typeof value === 'string' ? value : undefined
}

export const useActiveSessionIdState = () => runtimeStore.useValueState('activeSessionId', RUNTIME)

// --- Session Hooks ---

export const useSessionIds = () => runtimeStore.useSliceRowIds('sessionsByRecency', 'all', RUNTIME)

export const useSession = (id: string): Session | null => {
  const hasRow = runtimeStore.useHasRow('sessions', id, RUNTIME)
  const row = runtimeStore.useRow('sessions', id, RUNTIME)
  return hasRow ? decodeSession(id, row) : null
}

export const useSessionConfig = (id: string): SessionConfig => {
  const session = useSession(id)
  return session?.config ?? DEFAULT_SESSION_CONFIG
}

// --- Message Hooks ---

export const useSessionMessageIds = (sessionId: string) =>
  runtimeStore.useSliceRowIds('messagesBySession', sessionId, RUNTIME)

export const useMessage = (id: string): Message | null => {
  const row = runtimeStore.useRow('messages', id, RUNTIME)
  if (!row.createdAt) {
    return null
  }
  return decodeMessage(id, row)
}

// --- Request Hooks ---

/** Returns the currently active (pending/streaming) request for a session, or null. */
export const useActiveRequest = (sessionId: string): Request | null => {
  const ids = runtimeStore.useSliceRowIds('requestsBySession', sessionId, RUNTIME)
  const latestId = ids[0] ?? ''
  const hasRow = runtimeStore.useHasRow('requests', latestId, RUNTIME)
  const row = runtimeStore.useRow('requests', latestId, RUNTIME)

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
  const ids = runtimeStore.useSliceRowIds('requestsBySession', sessionId, RUNTIME)
  const latestId = ids[0] ?? ''
  const hasRow = runtimeStore.useHasRow('requests', latestId, RUNTIME)
  const row = runtimeStore.useRow('requests', latestId, RUNTIME)

  if (!hasRow || latestId === '') {
    return null
  }

  return decodeRequest(latestId, row)
}

/** Looks up the request linked to an assistant message. Returns null for user messages. */
export const useRequestForMessage = (messageId: string): Request | null => {
  const ids = runtimeStore.useSliceRowIds('requestByAssistantMessage', messageId, RUNTIME)
  const requestId = ids[0] ?? ''
  const hasRow = runtimeStore.useHasRow('requests', requestId, RUNTIME)
  const row = runtimeStore.useRow('requests', requestId, RUNTIME)

  if (!hasRow || requestId === '') {
    return null
  }

  return decodeRequest(requestId, row)
}
