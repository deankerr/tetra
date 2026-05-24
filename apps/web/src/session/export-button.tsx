import { exportSession } from '@tetra/core'
import { Button } from '@tetra/ui/components/ui/button'
import { DownloadIcon } from 'lucide-react'

import { useTetra } from '@/tetra-context'

export function SessionExportButton({ sessionId }: { sessionId: string }) {
  const { helpers } = useTetra()

  return (
    <Button
      onClick={() => {
        const exported = exportSession(helpers, sessionId)
        const title = exported.session.title.trim() ?? sessionId
        const safeTitle = title.replaceAll(/[^a-z0-9_-]+/giu, '-').replaceAll(/^-|-$/gu, '')
        const blob = new Blob([JSON.stringify(exported, null, 2)], {
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
