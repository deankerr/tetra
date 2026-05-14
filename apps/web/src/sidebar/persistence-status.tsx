import { Tooltip, TooltipContent, TooltipTrigger } from '@tetra/ui/components/ui/tooltip'
import { DatabaseIcon } from 'lucide-react'
import { usePersister, usePersisterStatus } from 'tinybase/ui-react'

const PERSISTER_STATUS = {
  idle: 0,
  loading: 1,
  saving: 2,
} as const

const IDLE_STATUS_VIEW = { label: 'Idle', tone: 'bg-emerald-500' }
const STATUS_VIEW: Record<number, { label: string; tone: string }> = {
  [PERSISTER_STATUS.idle]: IDLE_STATUS_VIEW,
  [PERSISTER_STATUS.loading]: { label: 'Loading', tone: 'bg-sky-500' },
  [PERSISTER_STATUS.saving]: { label: 'Saving', tone: 'bg-amber-500' },
}

export function PersistenceStatus() {
  const persister = usePersister()
  const status = usePersisterStatus()

  // TinyBase status is a compact enum: 0 idle, 1 loading, 2 saving.
  const { label, tone } = STATUS_VIEW[status] ?? IDLE_STATUS_VIEW
  const stats = persister?.getStats()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={`Persistence ${label.toLowerCase()}`}
            className="hover:bg-sidebar-accent flex size-8 items-center justify-center rounded-md"
            type="button"
          />
        }
      >
        <span className="relative">
          <DatabaseIcon className="size-3.5" />
          <span className={`absolute -right-1 -bottom-0.5 size-2 rounded-full ${tone}`} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="grid max-w-none justify-items-start gap-1 font-mono" side="top">
        <span className="font-sans text-[11px] font-medium">Persistence: {label}</span>
        <pre>{JSON.stringify(stats, null, 2)}</pre>
      </TooltipContent>
    </Tooltip>
  )
}
