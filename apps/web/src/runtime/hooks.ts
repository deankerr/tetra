import { decodeMessage, decodeRequest, decodeRequestConfig, decodeSession } from '@tetra/store'
import type { Message, Request, Schemas, Session, SessionConfig } from '@tetra/store'
import { useMemo, useSyncExternalStore } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

import { getSyncStatus, subscribeSyncStatus } from '@/runtime'
import type { SyncStatus } from '@/runtime'

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const runtimeStore = UiReact as unknown as UiReact.WithSchemas<Schemas>

const RUNTIME = 'runtime' as const

// --- Session Hooks ---

export const useSessionIds = () => runtimeStore.useSliceRowIds('sessionsByRecency', 'all', RUNTIME)

export const useSession = (id: string): Session | null => {
  const hasRow = runtimeStore.useHasRow('sessions', id, RUNTIME)
  const row = runtimeStore.useRow('sessions', id, RUNTIME)
  return hasRow ? decodeSession(id, row) : null
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

/** Returns the inference config from the most recent request for a session, or null. */
export const useLatestConfig = (sessionId: string): SessionConfig | null => {
  const ids = runtimeStore.useSliceRowIds('requestsBySession', sessionId, RUNTIME)
  const latestId = ids[0] ?? ''
  const raw = runtimeStore.useCell('requests', latestId, 'config', RUNTIME)

  return useMemo(() => {
    if (latestId === '') {
      return null
    }
    return decodeRequestConfig(raw)
  }, [latestId, raw])
}

// --- Sync Status ---

export const useSyncStatus = (): SyncStatus =>
  useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
