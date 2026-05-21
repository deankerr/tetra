import { DEFAULT_REQUEST_CONFIG, RequestConfig } from '@tetra/core-redesign'
import type { RequestConfigType, Rows } from '@tetra/core-redesign'
import { useMemo } from 'react'

import { tinybase } from '@/tetra/tinybase'

// Sessions sorted by updatedAt descending — most recently active first.
// appendMessage touches updatedAt, so this order naturally tracks conversation activity.
export const useSessionIds = () => {
  const sessions = tinybase.useTable('sessions')
  return useMemo(
    () =>
      Object.entries(sessions)
        .toSorted(([, left], [, right]) => right.updatedAt - left.updatedAt)
        .map(([id]) => id),
    [sessions],
  )
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
