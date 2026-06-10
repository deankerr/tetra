import { Button } from '@tetra/ui/components/ui/button'
import { DownloadIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

import { useTetra } from '@/tetra-context'

type SessionExportButtonProps = Pick<
  ComponentProps<typeof Button>,
  'children' | 'className' | 'size' | 'variant'
> & {
  sessionId: string
}

export function SessionExportButton({
  children,
  className,
  sessionId,
  size = 'icon-sm',
  variant = 'ghost',
}: SessionExportButtonProps) {
  const { transcripts } = useTetra()

  return (
    <Button
      aria-label="Export session"
      className={className}
      onClick={() => {
        const exported = transcripts.getSession(sessionId).export()
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
      size={size}
      title="Export session"
      type="button"
      variant={variant}
    >
      {children ?? <DownloadIcon />}
    </Button>
  )
}
