import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import type { FallbackProps } from 'react-error-boundary'

import { ErrorFallback } from '@/components/error-fallback'

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

function SessionGroupError({ error }: FallbackProps) {
  return <ErrorFallback error={error} title="Sessions unavailable" />
}
