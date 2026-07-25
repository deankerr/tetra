import { Button } from '@tetra/ui/components/ui/button'
import { AlertCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import type { FallbackProps } from 'react-error-boundary'

export function SessionGroupErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={SessionGroupError}
      onError={(error) => {
        console.error('Session navigation crashed', { error })
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

function SessionGroupError({ error, resetErrorBoundary }: FallbackProps) {
  const message =
    error instanceof Error ? error.message : 'The session list could not be displayed.'

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <AlertCircleIcon className="text-destructive size-5" />
      <div className="flex max-w-48 flex-col gap-1">
        <p className="text-xs font-medium">Sessions unavailable</p>
        <p className="text-muted-foreground text-xxs line-clamp-3" title={message}>
          {message}
        </p>
      </div>
      <Button onClick={resetErrorBoundary} size="sm" variant="outline">
        Try again
      </Button>
    </div>
  )
}
