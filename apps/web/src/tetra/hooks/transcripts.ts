import type { MessageRole, Rows } from '@tetra/core-redesign'
import type { UIMessage } from 'ai'
import { useSyncExternalStore } from 'react'

import { useTetra } from '@/tetra/provider'
import { tinybase } from '@/tetra/tinybase'

export const useSessionMessageIds = (sessionId: string) =>
  tinybase.useSliceRowIds('messagesBySession', sessionId)

export const useMessage = (id: string): Rows.Message | null => {
  const stored = useTinyBaseMessage(id)
  const liveParts = useLiveRunParts(id)

  if (stored === null) {
    return null
  }

  return liveParts === null ? stored : { ...stored, parts: liveParts }
}

// Reads the durable message row from TinyBase with inline type coercion.
function useTinyBaseMessage(id: string): Rows.Message | null {
  const hasRow = tinybase.useHasRow('messages', id)
  const row = tinybase.useRow('messages', id)
  if (!hasRow || id === '') {
    return null
  }

  return {
    createdAt: row.createdAt,
    id,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- UIMessage parts stored verbatim in TinyBase array cell.
    parts: row.parts as UIMessage['parts'],
    // oxlint-disable-next-line no-unsafe-type-assertion -- role is written as MessageRole and read back as string by TinyBase.
    role: row.role as MessageRole,
    sessionId: row.sessionId,
    updatedAt: row.updatedAt,
  }
}

// Subscribes to the live Run's in-flight parts via useSyncExternalStore.
// The Run holds parts that are ahead of TinyBase's 500ms durable write interval.
function useLiveRunParts(messageId: string): UIMessage['parts'] | null {
  const { runs } = useTetra()
  const run = runs.getByAssistantMessage(messageId)

  return useSyncExternalStore(
    (notify) => {
      if (run !== null) {
        run.addEventListener('cancel', notify)
        run.addEventListener('error', notify)
        run.addEventListener('finish', notify)
        run.addEventListener('snapshot', notify)
        run.addEventListener('status', notify)
      }

      return () => {
        if (run !== null) {
          run.removeEventListener('cancel', notify)
          run.removeEventListener('error', notify)
          run.removeEventListener('finish', notify)
          run.removeEventListener('snapshot', notify)
          run.removeEventListener('status', notify)
        }
      }
    },
    () => runs.getByAssistantMessage(messageId)?.parts ?? null,
  )
}
