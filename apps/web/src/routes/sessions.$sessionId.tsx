import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'

import { ErrorFallback } from '@/components/error-fallback'
import { WorkspacePane } from '@/components/workspace-pane'
import { SessionView } from '@/session/view'

export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionRoute,
  errorComponent: SessionRouteError,
})

function SessionRoute() {
  const { sessionId } = Route.useParams()

  return <SessionView sessionId={sessionId} />
}

function SessionRouteError({ error }: ErrorComponentProps) {
  return (
    <WorkspacePane title="Session unavailable">
      <ErrorFallback error={error} showHomeAction title="Session unavailable" />
    </WorkspacePane>
  )
}
