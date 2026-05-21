import { DEFAULT_REQUEST_CONFIG } from '@tetra/core-redesign'
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

  return { ...row, id }
}

// Reads directly from the sessionConfigs table — isolated from sessions, so sidebar
// re-renders are not triggered by config edits (e.g. keystrokes in provider options).
export const useSessionConfig = (id: string): RequestConfigType => {
  const hasRow = tinybase.useHasRow('sessionConfigs', id)
  const row = tinybase.useRow('sessionConfigs', id)

  if (!hasRow || id === '') {
    return DEFAULT_REQUEST_CONFIG
  }

  // JsonObject (TinyBase) and JSONObject (@ai-sdk/provider) are structurally identical.
  // oxlint-disable-next-line no-unsafe-type-assertion
  const providerOptions = row.providerOptions as unknown as RequestConfigType['providerOptions']
  // oxlint-disable-next-line no-unsafe-type-assertion -- toolIds written as string[], TinyBase reads back as Json[].
  const toolIds = row.toolIds as string[]
  return {
    modelId: row.modelId,
    ...(row.maxMessages !== 0 && { maxMessages: row.maxMessages }),
    ...(row.systemPromptId !== '' && { systemPromptId: row.systemPromptId }),
    ...(Object.keys(row.providerOptions).length > 0 && { providerOptions }),
    ...(row.toolIds.length > 0 && { toolIds }),
  }
}
