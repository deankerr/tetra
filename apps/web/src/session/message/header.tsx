import type { LibraryEntities } from '@tetra/schemas/library'
import { cn } from '@tetra/ui/lib/utils'
import { BanIcon, CheckCircle2Icon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'

import { catalogReact } from '@/stores'

import { getRunModelId } from './data'

type RunRow = LibraryEntities['runs']
type RunStatus = RunRow['status']

export function MessageHeader({ isActive, run }: { isActive: boolean; run: RunRow | null }) {
  const modelId = run === null ? '' : getRunModelId(run)
  const model = catalogReact.languageModels.useGet(modelId)

  if (run === null) {
    return null
  }

  const statusLabel = getRunStatusLabel({ isActive, status: run.status })

  return (
    <div className="flex items-center gap-2 group-[.is-user]:justify-end">
      <div
        aria-label={statusLabel}
        className="bg-secondary text-secondary-foreground flex h-7 w-fit items-center overflow-hidden rounded-md text-sm font-medium"
        title={statusLabel}
      >
        <span className="flex h-full min-w-0 items-center gap-2 px-2.5">
          {model !== null && (
            <img
              alt={`${model.providerName} logo`}
              className="size-4 shrink-0 rounded-sm object-cover"
              height={16}
              loading="lazy"
              src={`https://logos.orb.town/v1/avatar/${encodeURIComponent(model.provider)}.webp`}
              width={16}
            />
          )}
          {model === null ? (
            modelId !== '' && <span className="truncate font-mono">{modelId}</span>
          ) : (
            <span className="truncate">{model.name}</span>
          )}
        </span>
        <span
          className={cn(
            'border-border/70 text-muted-foreground flex h-full items-center border-l px-2 [&>svg]:size-4',
            run.status === 'error' && 'text-destructive',
          )}
        >
          {run.status === 'completed' && <CheckCircle2Icon />}
          {run.status === 'error' && <XCircleIcon />}
          {run.status === 'cancelled' && <BanIcon />}
          {run.status === 'active' && (
            <LoaderCircleIcon className={isActive ? 'animate-spin' : undefined} />
          )}
        </span>
      </div>
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
