import type { LibraryRows } from '@tetra/stores/web'
import { Badge } from '@tetra/ui/components/ui/badge'
import { BanIcon, CheckCircle2Icon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'

import { getRunModelId } from './data'

type MessageRow = LibraryRows['messages']
type RunRow = LibraryRows['runs']
type RunStatus = RunRow['status']

export function MessageHeader({
  isActive,
  message,
  run,
}: {
  isActive: boolean
  message: MessageRow
  run: RunRow | null
}) {
  const modelId = run === null ? '' : getRunModelId(run)

  return (
    <div className="flex items-center gap-2 group-[.is-user]:justify-end">
      <Badge className="rounded-xs font-mono uppercase" variant="secondary">
        {message.role}
      </Badge>
      {modelId !== '' && (
        <Badge className="max-w-60 rounded-xs font-mono" title={modelId} variant="secondary">
          <span className="truncate">{modelId}</span>
        </Badge>
      )}
      {run && <RunStatusBadge isActive={isActive} status={run.status} />}
    </div>
  )
}

function RunStatusBadge({ isActive, status }: { isActive: boolean; status: RunStatus }) {
  if (status === 'completed') {
    return (
      <Badge className="text-muted-foreground" title="Run completed" variant="secondary">
        <CheckCircle2Icon />
        <span className="sr-only">Run completed</span>
      </Badge>
    )
  }

  if (status === 'error') {
    return (
      <Badge title="Run error" variant="destructive">
        <XCircleIcon />
        <span className="sr-only">Run error</span>
      </Badge>
    )
  }

  if (status === 'cancelled') {
    return (
      <Badge className="text-muted-foreground" title="Run cancelled" variant="secondary">
        <BanIcon />
        <span className="sr-only">Run cancelled</span>
      </Badge>
    )
  }

  // A non-terminal row only spins/claims "active" when a live Run backs it. A stale
  // non-terminal row (crash, reload, another client) shows a static, inactive badge.
  const label = isActive ? 'Run active' : 'Run inactive'

  return (
    <Badge className="text-muted-foreground" title={label} variant="secondary">
      <LoaderCircleIcon className={isActive ? 'animate-spin' : undefined} />
      <span className="sr-only">{label}</span>
    </Badge>
  )
}
