import { Button } from '@tetra/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tetra/ui/components/ui/dropdown-menu'
import { BugIcon, CloudIcon, Trash2Icon } from 'lucide-react'

import { clearTetraIndexedDbAndReload } from '@/lib/tinybase'
import { clearTetraSyncDataAndReload } from '@/lib/websocket'

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
          <DropdownMenuItem
            onClick={() => {
              void clearTetraSyncDataAndReload()
            }}
          >
            <CloudIcon />
            Clear Cloudflare sync data
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
