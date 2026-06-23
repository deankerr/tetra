import { useCallback, useEffect } from 'react'

import { libraryTinybase, webTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

export function useSessionThreadView(sessionId: string) {
  const { selectThreadFromMessage, thread, threadAnchorMessageId, threadLeafMessageId } =
    useResolvedSessionThread(sessionId)
  const messageIds = thread?.messages().map((message) => message.id) ?? []

  return { messageIds, selectThreadFromMessage, threadAnchorMessageId, threadLeafMessageId }
}

export function useSessionThreadAppendTarget(sessionId: string) {
  const { selectThreadFromMessage, threadLeafMessageId } = useResolvedSessionThread(sessionId)

  return { selectThreadFromMessage, threadLeafMessageId }
}

export function useSessionThreadSelection(sessionId: string) {
  const { transcripts } = useTetra()
  const [, setThreadAnchorMessageId] = webTinybase.useCellState(
    'sessionThreadViews',
    sessionId,
    'threadAnchorMessageId',
  )

  const selectThreadFromMessage = useCallback(
    (fromMessageId: string) => {
      transcripts.getSession(sessionId).resolveThread({ fromMessageId })
      setThreadAnchorMessageId(fromMessageId)
    },
    [sessionId, setThreadAnchorMessageId, transcripts],
  )

  return { selectThreadFromMessage }
}

function useResolvedSessionThread(sessionId: string) {
  const { transcripts } = useTetra()
  const sessionMessageIds = libraryTinybase.useSliceRowIds('messagesBySession', sessionId)
  const [storedThreadAnchorMessageId, setThreadAnchorMessageId] = webTinybase.useCellState(
    'sessionThreadViews',
    sessionId,
    'threadAnchorMessageId',
  )
  const session = transcripts.getSession(sessionId)
  const validStoredAnchor =
    storedThreadAnchorMessageId !== undefined &&
    storedThreadAnchorMessageId !== null &&
    sessionMessageIds.includes(storedThreadAnchorMessageId)
  const threadAnchorMessageId = validStoredAnchor
    ? storedThreadAnchorMessageId
    : session.getNewestLeafMessageId()
  const thread =
    threadAnchorMessageId === null
      ? null
      : session.resolveThread({ fromMessageId: threadAnchorMessageId })
  const threadLeafMessageId = thread?.leafMessageId ?? null

  // Missing or stale local anchors initialize from the newest leaf; valid anchors stay caller-owned.
  useEffect(() => {
    if (storedThreadAnchorMessageId !== threadAnchorMessageId) {
      setThreadAnchorMessageId(threadAnchorMessageId)
    }
  }, [setThreadAnchorMessageId, storedThreadAnchorMessageId, threadAnchorMessageId])

  const selectThreadFromMessage = useCallback(
    (fromMessageId: string) => {
      transcripts.getSession(sessionId).resolveThread({ fromMessageId })
      setThreadAnchorMessageId(fromMessageId)
    },
    [sessionId, setThreadAnchorMessageId, transcripts],
  )

  return { selectThreadFromMessage, thread, threadAnchorMessageId, threadLeafMessageId }
}
