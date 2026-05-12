import { parseRequestConfig } from '@tetra/store'
import { Button } from '@tetra/ui/components/ui/button'
import { DownloadIcon } from 'lucide-react'

import { useSession } from '@/runtime/hooks'
import { useRuntime } from '@/runtime/use-runtime'

export function SessionExport({ sessionId }: { sessionId: string }) {
  const runtime = useRuntime()
  const session = useSession(sessionId)

  if (session === null) {
    return null
  }

  return (
    <Button
      onClick={() => {
        const title = session.title.trim() || session.id
        const safeTitle = title.replaceAll(/[^a-z0-9_-]+/giu, '-').replaceAll(/^-|-$/gu, '')
        const sessionExport = exportSession(runtime, session.id)
        const blob = new Blob([JSON.stringify(sessionExport, null, 2)], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `tetra-session-${safeTitle}.json`
        link.click()
        URL.revokeObjectURL(url)
      }}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <DownloadIcon />
    </Button>
  )
}

function exportSession(runtime: ReturnType<typeof useRuntime>, sessionId: string) {
  const session = runtime.store.getRow('sessions', sessionId)
  const messageIds = runtime.indexes.getSliceRowIds('messagesBySession', sessionId)
  const requestIds = runtime.indexes.getSliceRowIds('requestsBySession', sessionId)

  return {
    exportedAt: new Date().toISOString(),
    messages: messageIds
      .filter((messageId) => runtime.store.hasRow('messages', messageId))
      .map((messageId) => ({
        ...runtime.store.getRow('messages', messageId),
        id: messageId,
      })),
    requests: requestIds
      .filter((requestId) => runtime.store.hasRow('requests', requestId))
      .map((requestId) => {
        const request = runtime.store.getRow('requests', requestId)
        return {
          ...request,
          config: parseRequestConfig(request.config),
          id: requestId,
        }
      }),
    session: {
      ...session,
      config: parseRequestConfig(session.config),
      id: sessionId,
    },
  }
}
