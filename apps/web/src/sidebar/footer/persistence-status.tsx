import { Button } from '@tetra/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tetra/ui/components/ui/tooltip'
import { DatabaseIcon } from 'lucide-react'
import { usePersister, usePersisterStatus } from 'tinybase/ui-react'

// TinyBase persister status: 0 idle, 1 loading, 2 saving
const STATUS_LABEL: Record<number, string> = {
  0: 'Idle',
  1: 'Loading',
  2: 'Saving',
}

export function PersistenceStatus() {
  const persister = usePersister()
  // oxlint-disable-next-line no-unsafe-type-assertion -- Status is an ambient const enum; cast to number
  const status = usePersisterStatus() as number

  const label = STATUS_LABEL[status] ?? 'Idle'
  const stats = persister?.getStats()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`Persistence ${label.toLowerCase()}`}
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <DatabaseIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="grid max-w-none justify-items-start gap-1" side="top">
        <span className="text-[11px] font-medium">Persistence: {label}</span>
        <span className="text-muted-foreground font-mono text-[11px]">
          loads: {stats?.loads ?? 0} · saves: {stats?.saves ?? 0}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
