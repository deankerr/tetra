import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import type { FallbackProps } from 'react-error-boundary'

import { ErrorFallback } from '@/components/error-fallback'

export function SessionPanelErrorBoundary({
  children,
  sessionId,
}: {
  children: ReactNode
  sessionId: string
}) {
  return (
    <ErrorBoundary
      FallbackComponent={SessionPanelErrorFallback}
      onError={(error) => {
        console.error('Session view crashed', { error, sessionId })
      }}
      resetKeys={[sessionId]}
    >
      {children}
    </ErrorBoundary>
  )
}

function SessionPanelErrorFallback({ error }: FallbackProps) {
  return <ErrorFallback error={error} showHomeAction title="Session has crashed" />
}
