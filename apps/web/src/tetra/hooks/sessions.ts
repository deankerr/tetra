import { DEFAULT_REQUEST_CONFIG, RequestConfig } from '@tetra/core-redesign'
import type { RequestConfigType, Rows } from '@tetra/core-redesign'
import { useMemo } from 'react'

import { tinybase } from '@/tetra/tinybase'

export const useSessionIds = () => {
  const messages = tinybase.useTable('messages')
  const sessions = tinybase.useTable('sessions')

  return useMemo(() => {
    const latestMessageTimeBySessionId = new Map<string, number>()

    for (const message of Object.values(messages)) {
      const previous = latestMessageTimeBySessionId.get(message.sessionId) ?? 0
      const next = Math.max(message.updatedAt, message.createdAt, previous)
      latestMessageTimeBySessionId.set(message.sessionId, next)
    }

    return Object.entries(sessions)
      .toSorted(([leftSessionId, leftSession], [rightSessionId, rightSession]) => {
        const left = latestMessageTimeBySessionId.get(leftSessionId) ?? leftSession.createdAt
        const right = latestMessageTimeBySessionId.get(rightSessionId) ?? rightSession.createdAt
        return right - left
      })
      .map(([sessionId]) => sessionId)
  }, [messages, sessions])
}

export const useSession = (id: string): Rows.Session | null => {
  const hasRow = tinybase.useHasRow('sessions', id)
  const row = tinybase.useRow('sessions', id)
  if (!hasRow || id === '') {
    return null
  }

  return {
    ...row,
    config: parseConfig(row.config),
    id,
  }
}

export const useSessionConfig = (id: string): RequestConfigType => {
  const session = useSession(id)
  return session?.config ?? DEFAULT_REQUEST_CONFIG
}

function parseConfig(value: unknown): RequestConfigType {
  const result = RequestConfig.safeParse(value)
  return result.success ? result.data : DEFAULT_REQUEST_CONFIG
}
