import type { Rows } from '@tetra/core-redesign'
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

function useTinyBaseMessage(id: string): Rows.Message | null {
  const { accessors } = useTetra()
  const hasRow = tinybase.useHasRow('messages', id)
  tinybase.useRow('messages', id)
  if (!hasRow || id === '') {
    return null
  }

  return accessors.messages.get(id)
}

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
