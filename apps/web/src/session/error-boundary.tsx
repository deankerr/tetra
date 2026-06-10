import { Link } from '@tanstack/react-router'
import { Button } from '@tetra/ui/components/ui/button'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { AlertCircleIcon, CloudIcon, HomeIcon, Trash2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import type { FallbackProps } from 'react-error-boundary'

import { clearTetraIndexedDbAndReload } from '@/lib/tinybase'
import { clearTetraSyncDataAndReload } from '@/lib/websocket'

export function SessionPanelErrorBoundary({
  children,
  sessionId,
}: {
  children: ReactNode
  sessionId: string
}) {
  return (
    <ErrorBoundary
      fallbackRender={(props) => <SessionPanelErrorFallback {...props} />}
      onError={(error) => {
        console.error('Session view crashed', { error, sessionId })
      }}
      resetKeys={[sessionId]}
    >
      {children}
    </ErrorBoundary>
  )
}

function SessionPanelErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message =
    error instanceof Error ? error.message : 'An unexpected session view error occurred.'

  return (
    <div className="flex min-h-0 min-w-[420px] flex-1 flex-col border-r last:border-r-0">
      {/* Fallback header */}
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger title="Open sidebar" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">Session crashed</span>
      </header>

      {/* Recovery actions */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertCircleIcon className="text-destructive size-8" />
        <div className="flex max-w-md flex-col gap-1">
          <h1 className="text-lg font-medium">Session has crashed</h1>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={resetErrorBoundary} variant="outline">
            Try again
          </Button>
          <Button render={<Link to="/" />} variant="outline">
            <HomeIcon />
            New session
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
          <Button
            onClick={() => {
              void clearTetraSyncDataAndReload()
            }}
            variant="outline"
          >
            <CloudIcon />
            Clear Cloudflare sync data
          </Button>
        </div>
      </div>
    </div>
  )
}
