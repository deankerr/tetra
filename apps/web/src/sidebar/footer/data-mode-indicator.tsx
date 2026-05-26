import { Button } from '@tetra/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tetra/ui/components/ui/tooltip'
import { CloudIcon, DatabaseIcon } from 'lucide-react'

import { tinybase } from '@/lib/tinybase'

export function DataModeIndicator() {
  const persister = tinybase.usePersister()
  const synchronizer = tinybase.useSynchronizer()

  return (
    <div className="flex items-center gap-1">
      {persister && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button aria-label="Local persistence active" size="icon" variant="ghost">
                <DatabaseIcon />
              </Button>
            }
          />
          <TooltipContent side="top">IndexedDB persister is active.</TooltipContent>
        </Tooltip>
      )}
      {synchronizer && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button aria-label="Remote sync active" size="icon" variant="ghost">
                <CloudIcon />
              </Button>
            }
          />
          <TooltipContent side="top">
            Cloudflare Durable Object synchronizer is active.
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
