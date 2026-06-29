import { useCallback, useEffect } from 'react'

import { useApp } from '@/app'
import { libraryReact, webReact } from '@/store'

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
  const { transcripts } = useApp()
  const [, setThreadAnchorMessageId] = webReact.sessionThreadViews.useFieldState(
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
  const { transcripts } = useApp()
  const sessionMessages = libraryReact.messages.useBySession(sessionId)
  const [storedThreadAnchorMessageId, setThreadAnchorMessageId] =
    webReact.sessionThreadViews.useFieldState(sessionId, 'threadAnchorMessageId')
  const session = transcripts.getSession(sessionId)
  const validStoredAnchor =
    storedThreadAnchorMessageId !== undefined &&
    storedThreadAnchorMessageId !== null &&
    sessionMessages.some((message) => message.id === storedThreadAnchorMessageId)
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
