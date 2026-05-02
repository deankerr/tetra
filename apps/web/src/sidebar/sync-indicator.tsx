import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSyncStatus } from '@/runtime/hooks'

const SYNC_CONFIG = {
  connected: { color: 'bg-emerald-500', label: 'Synced' },
  disconnected: { color: 'bg-amber-500', label: 'Disconnected' },
  off: { color: 'bg-zinc-400', label: 'Local only' },
} as const

export function SyncIndicator() {
  const status = useSyncStatus()
  const { color, label } = SYNC_CONFIG[status]

  return (
    <div className="size-7">
      <Tooltip>
        <TooltipTrigger className="cursor-default">
          <span className={`block size-2 rounded-full ${color}`} />
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </div>
  )
}
