import type { Rows } from '@tetra/store-schema'
import { Badge } from '@tetra/ui/components/ui/badge'
import { BanIcon, CheckCircle2Icon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'

import { getRunModelId } from './data'

type MessageRow = Rows['messages']
type RunRow = Rows['runs']
type RunStatus = RunRow['status']

export function MessageHeader({ message, run }: { message: MessageRow; run: RunRow | null }) {
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
      {run && <RunStatusBadge status={run.status} />}
    </div>
  )
}

function RunStatusBadge({ status }: { status: RunStatus }) {
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

  return (
    <Badge className="text-muted-foreground" title="Run active" variant="secondary">
      <LoaderCircleIcon className="animate-spin" />
      <span className="sr-only">Run active</span>
    </Badge>
  )
}
