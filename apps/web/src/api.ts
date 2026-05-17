import { useNavigate, useSearch } from '@tanstack/react-router'
import { DEFAULT_MODEL_CONFIG, ModelConfig as ModelConfigSchema } from '@tetra/core'
import type {
  Message as CoreMessage,
  ModelConfig,
  Request,
  Session,
  TetraSchemas,
} from '@tetra/core'
import type { UIMessage } from 'ai'
import { useMemo, useSyncExternalStore } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

import { useTetra } from '@/tetra-provider'

// Re-narrows TinyBase's generic AnyArray/string types to AI SDK specifics
type Message = Omit<CoreMessage, 'parts' | 'role'> & {
  parts: UIMessage['parts']
  role: UIMessage['role']
}

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const store = UiReact as unknown as UiReact.WithSchemas<TetraSchemas>

// --- App State Hooks ---

export const useActiveSessionId = () => {
  const search = useSearch({ from: '/' })
  return search.session
}

export const useSetActiveSessionId = () => {
  const navigate = useNavigate({ from: '/' })

  return (sessionId: string | undefined) => {
    void navigate({
      search: (current) => ({
        ...current,
        session: sessionId,
      }),
    })
  }
}

// --- Session Hooks ---

export const useSessionIds = () => {
  const messages = store.useTable('messages')
  const sessions = store.useTable('sessions')

  return useMemo(() => {
    const latestMessageTimeBySessionId = new Map<string, number>()

    for (const message of Object.values(messages)) {
      const { sessionId: sid, updatedAt, createdAt } = message
      const previous = latestMessageTimeBySessionId.get(sid) ?? 0
      const next = Math.max(updatedAt, createdAt, previous)
      latestMessageTimeBySessionId.set(sid, next)
    }

    return Object.entries(sessions)
      .toSorted(([leftSessionId, leftSession], [rightSessionId, rightSession]) => {
        const leftCreatedAt = leftSession.createdAt
        const rightCreatedAt = rightSession.createdAt
        const left = latestMessageTimeBySessionId.get(leftSessionId) ?? leftCreatedAt
        const right = latestMessageTimeBySessionId.get(rightSessionId) ?? rightCreatedAt
        return right - left
      })
      .map(([sessionId]) => sessionId)
  }, [messages, sessions])
}

export const useSession = (id: string): Session | null => {
  const hasRow = store.useHasRow('sessions', id)
  const row = store.useRow('sessions', id)
  if (!hasRow) {
    return null
  }
  return { ...row, id }
}

export const useSessionConfig = (id: string): ModelConfig => {
  const session = useSession(id)
  if (session === null) {
    return DEFAULT_MODEL_CONFIG
  }
  const result = ModelConfigSchema.safeParse(session.config)
  return result.success ? result.data : DEFAULT_MODEL_CONFIG
}

// --- Message Hooks ---

export const useSessionMessageIds = (sessionId: string) =>
  store.useSliceRowIds('messagesBySession', sessionId)

const useTinyBaseMessage = (id: string): Message | null => {
  const row = store.useRow('messages', id)
  if (!row.createdAt) {
    return null
  }
  return {
    ...row,
    id,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase stores AI SDK parts in an array cell.
    parts: row.parts as UIMessage['parts'],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Runtime writers constrain message roles.
    role: row.role as UIMessage['role'],
  }
}

// Returns only the fields the live stream knows — id, parts, role
const useStreamingMessage = (id: string): Pick<Message, 'id' | 'parts' | 'role'> | null => {
  const { streamingState } = useTetra()
  const snapshot = useSyncExternalStore(
    (fn) => streamingState.subscribe(id, fn),
    () => streamingState.get(id),
  )
  if (snapshot === null) {
    return null
  }
  return { id, parts: snapshot.parts, role: snapshot.role }
}

export const useMessage = (id: string): Message | null => {
  const streaming = useStreamingMessage(id)
  const stored = useTinyBaseMessage(id)
  if (!streaming) {
    return stored
  }
  // Merge TinyBase metadata (createdAt/updatedAt/sessionId) with live streaming parts
  // so timestamps show correctly while streaming instead of epoch 0
  if (!stored) {
    return null
  }
  return { ...stored, parts: streaming.parts }
}

// --- Request Hooks ---

export const useSessionRequestIds = (sessionId: string) =>
  store.useSliceRowIds('requestsBySession', sessionId)

/** Returns the currently active (streaming) request for a session, or null. */
export const useStreamingRequest = (sessionId: string): Request | null => {
  const ids = store.useSliceRowIds('requestsBySession', sessionId)
  const latestId = ids[0] ?? ''
  const hasRow = store.useHasRow('requests', latestId)
  const row = store.useRow('requests', latestId)

  if (!hasRow || latestId === '') {
    return null
  }
  if (row.status !== 'streaming') {
    return null
  }

  return { ...row, id: latestId }
}

/** Returns a request by its row ID. */
export const useRequest = (id: string): Request | null => {
  const hasRow = store.useHasRow('requests', id)
  const row = store.useRow('requests', id)
  if (!hasRow || !id) {
    return null
  }
  return { ...row, id }
}

export const useRequestStepIds = (requestId: string) =>
  store.useSliceRowIds('stepsByRequest', requestId)

/** Looks up the request linked to an assistant message. Returns null for user messages. */
export const useRequestForMessage = (messageId: string): Request | null => {
  const ids = store.useSliceRowIds('requestByAssistantMessage', messageId)
  const requestId = ids[0] ?? ''
  const hasRow = store.useHasRow('requests', requestId)
  const row = store.useRow('requests', requestId)

  if (!hasRow || requestId === '') {
    return null
  }

  return { ...row, id: requestId }
}
