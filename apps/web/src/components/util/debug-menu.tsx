import { loadSeeds } from '@tetra/core-redesign'
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

import { useTetra } from '@/tetra/provider'

import { clearAllData } from './clear-data'

export function DebugMenu() {
  const { sessions } = useTetra()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon">
            <BugIcon />
          </Button>
        }
      ></DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Debug</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              loadSeeds(sessions)
            }}
          >
            <DatabaseIcon />
            Load seed data
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void clearAllData()}>
            <Trash2Icon />
            Clear all data
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
