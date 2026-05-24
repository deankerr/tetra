import { loadSeeds } from '@tetra/core'
import { Button } from '@tetra/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tetra/ui/components/ui/dropdown-menu'
import { BugIcon, DatabaseIcon, Trash2Icon } from 'lucide-react'

import { useTetra } from '@/tetra-context'

export function DebugMenu() {
  const { helpers } = useTetra()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="icon" variant="ghost">
            <BugIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-40" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Debug</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              loadSeeds(helpers)
            }}
          >
            <DatabaseIcon />
            Load seed data
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Trash2Icon />
            Clear all data
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
