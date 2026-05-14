import { parseRequestConfig } from '@tetra/store'
import type { Schemas, TetraStore } from '@tetra/store'
import { Button } from '@tetra/ui/components/ui/button'
import { DownloadIcon } from 'lucide-react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

import { useSession } from '@/runtime/hooks'

type ExportStore = Pick<TetraStore, 'indexes' | 'store'>

// Schema-aware TinyBase React hooks.
// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const tinybase = UiReact as unknown as UiReact.WithSchemas<Schemas>

export function SessionExport({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId)
  // The export reads from the TinyBase objects provided by App.
  const indexes = tinybase.useIndexes()
  const store = tinybase.useStore()

  if (session === null) {
    return null
  }

  return (
    <Button
      onClick={() => {
        if (indexes === undefined || store === undefined) {
          throw new Error('TinyBase store is not available for export')
        }

        const title = session.title.trim() || session.id
        const safeTitle = title.replaceAll(/[^a-z0-9_-]+/giu, '-').replaceAll(/^-|-$/gu, '')
        const sessionExport = exportSession({ indexes, store }, session.id)
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

function exportSession(tetra: ExportStore, sessionId: string) {
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
