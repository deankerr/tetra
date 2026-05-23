import type { Rows } from '@tetra/core'
import type { UIMessage } from 'ai'
import { useMemo, useSyncExternalStore } from 'react'

import { useTetra } from '@/tetra/provider'
import { typedTinybase } from '@/tetra/tinybase'

export const useSessionMessageIds = (sessionId: string) =>
  typedTinybase.useSliceRowIds('messagesBySession', sessionId)

export const useSessionMessages = (sessionId: string): Rows.Message[] => {
  const messageIds = useSessionMessageIds(sessionId)
  const messages = typedTinybase.useEntityList('messages')

  return useMemo(() => {
    const messagesById = new Map(messages.map((message) => [message.id, message]))
    return messageIds.flatMap((messageId) => messagesById.get(messageId) ?? [])
  }, [messageIds, messages])
}

export const useMessage = (id: string): Rows.Message | null => {
  const stored = useTinyBaseMessage(id)
  const liveParts = useLiveRunParts(id)

  if (stored === null) {
    return null
  }

  return liveParts === null ? stored : { ...stored, parts: liveParts }
}

// Reads the durable message row through the typed TinyBase schema boundary.
function useTinyBaseMessage(id: string): Rows.Message | null {
  const message = typedTinybase.useEntity('messages', id)
  if (id === '') {
    return null
  }

  return message
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
