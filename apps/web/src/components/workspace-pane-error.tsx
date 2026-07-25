import { Button } from '@tetra/ui/components/ui/button'
import { AlertCircleIcon, HomeIcon } from 'lucide-react'

export function WorkspacePaneError({
  error,
  onRetry,
  showHomeAction = false,
  title,
}: {
  error: unknown
  onRetry?: () => void
  showHomeAction?: boolean
  title: string
}) {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.'

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertCircleIcon className="text-destructive size-8" />
      <div className="flex max-w-md flex-col gap-1">
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
      {onRetry === undefined && !showHomeAction ? null : (
        <div className="flex flex-wrap justify-center gap-2">
          {onRetry === undefined ? null : (
            <Button onClick={onRetry} variant="outline">
              Try again
            </Button>
          )}
          {showHomeAction ? (
            <Button
              nativeButton={false}
              render={<a aria-label="New session" href="/" />}
              variant="outline"
            >
              <HomeIcon data-icon="inline-start" />
              New session
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
