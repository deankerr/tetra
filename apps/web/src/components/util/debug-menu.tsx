import { BugIcon, Trash2Icon } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Wipe all persisted data (OPFS + localStorage) and reload. */
export async function clearAllData() {
  // OPFS — where the runtime store is persisted
  const root = await navigator.storage.getDirectory()
  try {
    await root.removeEntry('tetra-runtime.json')
  } catch {
    // File may not exist
  }
  localStorage.removeItem('tetra-ui')
  localStorage.removeItem('tetra-runtime-id')
  location.reload()
}

export function DebugMenu() {
  return (
    <div className="fixed bottom-0 left-0 z-[9999]">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex size-7 items-center justify-center rounded-md bg-background/50 text-muted-foreground/30 opacity-0 shadow-sm ring-1 ring-border/30 transition-opacity hover:opacity-100">
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
