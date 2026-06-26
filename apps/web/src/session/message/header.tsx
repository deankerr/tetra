import type { LibraryRows } from '@tetra/schemas/library'
import { Badge } from '@tetra/ui/components/ui/badge'
import { cn } from '@tetra/ui/lib/utils'
import { BanIcon, CheckCircle2Icon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'

import { getRunModelId } from './data'

type RunRow = LibraryRows['runs']
type RunStatus = RunRow['status']

export function MessageHeader({ isActive, run }: { isActive: boolean; run: RunRow | null }) {
  if (run === null) {
    return null
  }

  const modelId = getRunModelId(run)
  const statusLabel = getRunStatusLabel({ isActive, status: run.status })

  return (
    <div className="flex items-center gap-2 group-[.is-user]:justify-end">
      <Badge
        aria-label={statusLabel}
        className={cn(
          'gap-2 rounded-sm font-mono',
          run.status !== 'error' && 'text-muted-foreground',
        )}
        title={statusLabel}
        variant={run.status === 'error' ? 'destructive' : 'secondary'}
      >
        {modelId !== '' && <span className="truncate">{modelId}</span>}
        {run.status === 'completed' && <CheckCircle2Icon />}
        {run.status === 'error' && <XCircleIcon />}
        {run.status === 'cancelled' && <BanIcon />}
        {run.status === 'active' && (
          <LoaderCircleIcon className={isActive ? 'animate-spin' : undefined} />
        )}
      </Badge>
    </div>
  )
}

function getRunStatusLabel({ isActive, status }: { isActive: boolean; status: RunStatus }) {
  if (status === 'completed') {
    return 'Run completed'
  }

  if (status === 'error') {
    return 'Run error'
  }

  if (status === 'cancelled') {
    return 'Run cancelled'
  }

  // A non-terminal row only spins/claims "active" when a live Run backs it. A stale
  // non-terminal row (crash, reload, another client) shows a static, inactive badge.
  return isActive ? 'Run active' : 'Run inactive'
}
