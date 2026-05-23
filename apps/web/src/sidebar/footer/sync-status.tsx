import { Button } from '@tetra/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tetra/ui/components/ui/tooltip'
import { WifiIcon, WifiLowIcon, WifiOffIcon } from 'lucide-react'

import { useTetra } from '@/provider'

export function SyncStatus() {
  const { sync } = useTetra()

  let statusLabel: string
  if (!sync.enabled) {
    statusLabel = 'Disabled'
  } else if (sync.connected) {
    statusLabel = 'Connected'
  } else {
    statusLabel = 'Connecting…'
  }
  const toggleLabel = sync.enabled ? 'disable' : 'enable'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`Sync ${statusLabel.toLowerCase()} — click to ${toggleLabel}`}
            onClick={sync.toggle}
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <span className="relative">
          {sync.connected && <WifiIcon className="size-3.5" />}
          {!sync.connected && sync.enabled && <WifiLowIcon className="size-3.5" />}
          {!sync.enabled && <WifiOffIcon className="size-3.5" />}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span className="text-[11px] font-medium">
          Sync: {statusLabel} — click to {toggleLabel}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
