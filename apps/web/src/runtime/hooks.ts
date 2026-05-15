import { useNavigate, useSearch } from '@tanstack/react-router'
import { DEFAULT_REQUEST_CONFIG, parseRequestConfig } from '@tetra/store'
import type { MessageRow, RequestConfig, RequestRow, Schemas, SessionRow } from '@tetra/store'
import type { UIMessage } from 'ai'
import { useMemo } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

export type Message = Omit<MessageRow, 'parts' | 'role'> & {
  id: string
  parts: UIMessage['parts']
  role: UIMessage['role']
}

export type Request = Omit<RequestRow, 'config'> & {
  config: RequestConfig
  id: string
}

export type Session = Omit<SessionRow, 'config'> & {
  config: RequestConfig
  id: string
}

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const store = UiReact as unknown as UiReact.WithSchemas<Schemas>

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

    // Derive each session's recency from its transcript instead of mutable session metadata.
    for (const message of Object.values(messages)) {
      const previous = latestMessageTimeBySessionId.get(message.sessionId) ?? 0
      const next = Math.max(message.updatedAt, message.createdAt, previous)
      latestMessageTimeBySessionId.set(message.sessionId, next)
    }

    // Keep empty sessions in creation order, then sort active conversations by latest message.
    return Object.entries(sessions)
      .toSorted(([leftSessionId, leftSession], [rightSessionId, rightSession]) => {
        const left = latestMessageTimeBySessionId.get(leftSessionId) ?? leftSession.createdAt
        const right = latestMessageTimeBySessionId.get(rightSessionId) ?? rightSession.createdAt
        return right - left
      })
      .map(([sessionId]) => sessionId)
  }, [messages, sessions])
}

export const useSession = (id: string): Session | null => {
  const hasRow = store.useHasRow('sessions', id)
  const row = store.useRow('sessions', id)
  return hasRow ? { ...row, config: parseRequestConfig(row.config), id } : null
}

export const useSessionConfig = (id: string): RequestConfig => {
  const session = useSession(id)
  return session?.config ?? DEFAULT_REQUEST_CONFIG
}

// --- Message Hooks ---

export const useSessionMessageIds = (sessionId: string) =>
  store.useSliceRowIds('messagesBySession', sessionId)

export const useMessage = (id: string): Message | null => {
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

// --- Request Hooks ---

export const useSessionRequestIds = (sessionId: string) =>
  store.useSliceRowIds('requestsBySession', sessionId)

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

  return { ...row, config: parseRequestConfig(row.config), id: latestId }
}

/** Returns a request by its row ID. */
export const useRequest = (id: string): Request | null => {
  const hasRow = store.useHasRow('requests', id)
  const row = store.useRow('requests', id)
  if (!hasRow || !id) {
    return null
  }
  return { ...row, config: parseRequestConfig(row.config), id }
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

  return { ...row, config: parseRequestConfig(row.config), id: requestId }
}
