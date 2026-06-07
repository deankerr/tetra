import { Button } from '@tetra/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tetra/ui/components/ui/dropdown-menu'
import { toast } from '@tetra/ui/components/ui/sonner'
import { BugIcon, CloudIcon, Trash2Icon } from 'lucide-react'

import { clearTetraIndexedDbAndReload } from '@/lib/tinybase'
import { clearTetraSyncDataAndReload, hasSyncWorkerUrl } from '@/lib/websocket'

async function handleClearTetraSyncData(): Promise<void> {
  try {
    await clearTetraSyncDataAndReload()
  } catch (error: unknown) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

export function DebugMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label="Open debug menu" size="icon" title="Open debug menu" variant="ghost">
            <BugIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-56" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Debug</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              void clearTetraIndexedDbAndReload()
            }}
          >
            <Trash2Icon />
            Clear all IndexedDB data
          </DropdownMenuItem>
          {hasSyncWorkerUrl() && (
            <DropdownMenuItem
              onClick={() => {
                void handleClearTetraSyncData()
              }}
            >
              <CloudIcon />
              Clear Cloudflare sync data
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
