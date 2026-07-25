import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute, useRouter } from '@tanstack/react-router'

import { WorkspacePane } from '@/components/workspace-pane'
import { WorkspacePaneError } from '@/components/workspace-pane-error'
import { SessionView } from '@/session/view'

export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionRoute,
  errorComponent: SessionRouteError,
})

function SessionRoute() {
  const { sessionId } = Route.useParams()

  return <SessionView sessionId={sessionId} />
}

function SessionRouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <WorkspacePane title="Session unavailable">
      <WorkspacePaneError
        error={error}
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
        showHomeAction
        title="Session unavailable"
      />
    </WorkspacePane>
  )
}
