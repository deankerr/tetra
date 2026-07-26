import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'

import { ErrorFallback } from '@/components/error-fallback'
import { WorkspacePane } from '@/components/workspace-pane'
import { NewSessionPage } from '@/session/new-session-page'

export const Route = createFileRoute('/')({
  component: NewSessionPage,
  errorComponent: NewSessionRouteError,
})

function NewSessionRouteError({ error }: ErrorComponentProps) {
  return (
    <WorkspacePane title="New session unavailable">
      <ErrorFallback error={error} title="New session unavailable" />
    </WorkspacePane>
  )
}
