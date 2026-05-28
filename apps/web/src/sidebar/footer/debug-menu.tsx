import { Button } from '@tetra/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tetra/ui/components/ui/dropdown-menu'
import { BugIcon, Trash2Icon } from 'lucide-react'

import { clearTetraIndexedDbAndReload } from '@/lib/tinybase'

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
      <DropdownMenuContent align="start" className="w-40" side="top">
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
