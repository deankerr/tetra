import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import type { FallbackProps } from 'react-error-boundary'

import { WorkspacePaneError } from '@/components/workspace-pane-error'

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

function SessionPanelErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <WorkspacePaneError
      error={error}
      onRetry={resetErrorBoundary}
      showHomeAction
      title="Session has crashed"
    />
  )
}
