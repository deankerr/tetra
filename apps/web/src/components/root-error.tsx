import type { ErrorComponentProps } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@tetra/ui/components/ui/button'
import { AlertCircleIcon, CloudIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { clearTetraIndexedDbAndReload } from '@/lib/tinybase'
import { clearTetraSyncDataAndReload, hasSyncWorkerUrl } from '@/lib/websocket'

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const [syncResetError, setSyncResetError] = useState<string>()

  async function handleClearTetraSyncData(): Promise<void> {
    setSyncResetError(undefined)
    try {
      await clearTetraSyncDataAndReload()
    } catch (resetError: unknown) {
      console.error(resetError)
      setSyncResetError(resetError instanceof Error ? resetError.message : String(resetError))
    }
  }

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <AlertCircleIcon className="text-destructive size-8" />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-medium">Something went wrong</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          {error instanceof Error ? error.message : 'An unexpected error occurred.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          onClick={() => {
            reset()
            void router.invalidate()
          }}
          variant="outline"
        >
          Try again
        </Button>
        <Button
          onClick={() => {
            void clearTetraIndexedDbAndReload()
          }}
          variant="outline"
        >
          <Trash2Icon />
          Clear all IndexedDB data
        </Button>
        {hasSyncWorkerUrl() && (
          <Button
            onClick={() => {
              void handleClearTetraSyncData()
            }}
            variant="outline"
          >
            <CloudIcon />
            Clear Cloudflare sync data
          </Button>
        )}
      </div>
      {syncResetError !== undefined && (
        <p className="text-destructive max-w-md text-center text-sm">{syncResetError}</p>
      )}
    </div>
  )
}
