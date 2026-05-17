import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tetra/ui/components/ui/dropdown-menu'
import { BugIcon, Trash2Icon } from 'lucide-react'

import { clearAllData } from './clear-data'

export function DebugMenu() {
  return (
    <div className="fixed bottom-0 left-0 z-[9999]">
      <DropdownMenu>
        <DropdownMenuTrigger className="bg-background/50 text-muted-foreground/30 ring-border/30 flex size-7 items-center justify-center rounded-md opacity-0 shadow-sm ring-1 transition-opacity hover:opacity-100">
          <BugIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Debug</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => void clearAllData()}>
              <Trash2Icon />
              Clear all data
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
