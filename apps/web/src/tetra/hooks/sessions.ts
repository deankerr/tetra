import { DEFAULT_REQUEST_CONFIG, sessionConfigRowToRequestConfig } from '@tetra/core'
import type { RequestConfigType, Rows } from '@tetra/core'
import { useMemo } from 'react'

import { typedTinybase } from '@/tetra/tinybase'

// Sessions sorted by updatedAt descending — most recently active first.
// appendMessage touches updatedAt, so this order naturally tracks conversation activity.
export const useSessionIds = () => {
  const sessions = typedTinybase.useEntityList('sessions')
  return useMemo(
    () =>
      sessions
        .toSorted((left, right) => right.updatedAt - left.updatedAt)
        .map((session) => session.id),
    [sessions],
  )
}

export const useSession = (id: string): Rows.Session | null => {
  const session = typedTinybase.useEntity('sessions', id)
  if (id === '') {
    return null
  }

  return session
}

// Reads directly from the sessionConfigs table — isolated from sessions, so sidebar
// re-renders are not triggered by config edits (e.g. keystrokes in provider options).
export const useSessionConfig = (id: string): RequestConfigType => {
  const row = typedTinybase.useRow('sessionConfigs', id)

  if (row === null || id === '') {
    return DEFAULT_REQUEST_CONFIG
  }

  return sessionConfigRowToRequestConfig(row)
}
