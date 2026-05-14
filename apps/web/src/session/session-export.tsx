import { parseRequestConfig } from '@tetra/store'
import { Button } from '@tetra/ui/components/ui/button'
import { DownloadIcon } from 'lucide-react'

import { useSession } from '@/runtime/hooks'
import { getTetra } from '@/runtime/tetra-client'
import type { TetraApp } from '@/runtime/tetra-client'

export function SessionExport({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId)

  if (session === null) {
    return null
  }

  return (
    <Button
      onClick={() => {
        void (async () => {
          const tetra = await getTetra()
          const title = session.title.trim() || session.id
          const safeTitle = title.replaceAll(/[^a-z0-9_-]+/giu, '-').replaceAll(/^-|-$/gu, '')
          const sessionExport = exportSession(tetra, session.id)
          const blob = new Blob([JSON.stringify(sessionExport, null, 2)], {
            type: 'application/json',
          })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `tetra-session-${safeTitle}.json`
          link.click()
          URL.revokeObjectURL(url)
        })()
      }}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <DownloadIcon />
    </Button>
  )
}

function exportSession(tetra: TetraApp, sessionId: string) {
  const session = tetra.store.getRow('sessions', sessionId)
  const messageIds = tetra.indexes.getSliceRowIds('messagesBySession', sessionId)
  const requestIds = tetra.indexes.getSliceRowIds('requestsBySession', sessionId)

  return {
    exportedAt: new Date().toISOString(),
    messages: messageIds
      .filter((messageId) => tetra.store.hasRow('messages', messageId))
      .map((messageId) => ({
        ...tetra.store.getRow('messages', messageId),
        id: messageId,
      })),
    requests: requestIds
      .filter((requestId) => tetra.store.hasRow('requests', requestId))
      .map((requestId) => {
        const request = tetra.store.getRow('requests', requestId)
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
