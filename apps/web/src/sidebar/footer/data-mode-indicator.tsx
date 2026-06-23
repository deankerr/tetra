import { Button } from '@tetra/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tetra/ui/components/ui/dropdown-menu'
import { CloudIcon, DatabaseIcon } from 'lucide-react'

import { catalogTinybase, clearTetraIndexedDbAndReload, libraryTinybase } from '@/lib/tinybase'
import { clearTetraSyncDataAndReload } from '@/lib/websocket'

export function DataModeIndicator() {
  const catalogPersister = catalogTinybase.useRawPersister()
  const libraryPersister = libraryTinybase.useRawPersister()
  const synchronizer = libraryTinybase.useRawSynchronizer()
  const persister = catalogPersister ?? libraryPersister
  const hasPersister = persister !== undefined
  const hasSynchronizer = synchronizer !== undefined

  return (
    <div className="flex items-center gap-1">
      {hasPersister && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button aria-label="Open persister menu" size="icon" variant="ghost">
                <DatabaseIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-56" side="top">
            <DropdownMenuGroup>
              <DropdownMenuLabel>IndexedDB Persister</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  void clearTetraIndexedDbAndReload()
                }}
              >
                <DatabaseIcon />
                Clear data
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {hasSynchronizer && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button aria-label="Open sync menu" size="icon" variant="ghost">
                <CloudIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-56" side="top">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Cloudflare Sync</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  void clearTetraSyncDataAndReload()
                }}
              >
                <CloudIcon />
                Clear data
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
